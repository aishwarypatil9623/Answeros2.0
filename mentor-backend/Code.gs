/*
 * AnswerOS AI Mentor — standalone Gemini backend
 *
 * Phase 9:
 * - Secure server-side Gemini adapter intended for a SEPARATE Apps Script deployment.
 * - API key is read only from Script Properties (GEMINI_API_KEY).
 * - Model is configurable through GEMINI_MODEL; default is gemini-3.6-flash.
 * - The file is NOT connected to the existing AnswerOS Apps Script.
 * - No existing Apps Script file is modified by this commit.
 *
 * Setup for a future deployment:
 *   Script Properties:
 *     GEMINI_API_KEY = <your restricted Gemini API key>
 *     GEMINI_MODEL   = gemini-3.6-flash
 *
 * The deployed endpoint accepts a Mentor Packet via POST and returns a
 * validated Mentor Report. Authentication/routing for the endpoint must
 * be configured before exposing it publicly.
 */

const MENTOR_BACKEND_VERSION = 'mentor-gemini-backend-v1';
const DEFAULT_MODEL = 'gemini-3.6-flash';

const MENTOR_REPORT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    observations: {
      type: 'array',
      items: { type: 'string' }
    },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string' },
          reason: { type: 'string' },
          target: { type: 'string' }
        },
        required: ['action', 'reason']
      }
    },
    focus: {
      type: 'object',
      properties: {
        primary: { type: 'string' },
        why: { type: 'string' },
        nextStep: { type: 'string' }
      },
      required: ['primary', 'why', 'nextStep']
    }
  },
  required: ['summary', 'observations', 'actions', 'focus']
};

function doGet() {
  return jsonOutput_({
    ok: true,
    service: 'AnswerOS AI Mentor',
    version: MENTOR_BACKEND_VERSION
  });
}

function doPost(e) {
  try {
    const body = parseRequest_(e);
    const packet = body && body.packet ? body.packet : body;

    if (!packet || typeof packet !== 'object') {
      return jsonOutput_({
        ok: false,
        error: 'INVALID_PACKET'
      });
    }

    const report = generateMentorReport_(packet);

    return jsonOutput_({
      ok: true,
      version: MENTOR_BACKEND_VERSION,
      report
    });
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);

    return jsonOutput_({
      ok: false,
      error: 'MENTOR_BACKEND_ERROR',
      message: error && error.message ? error.message : String(error)
    });
  }
}

function generateMentorReport_(packet) {
  const properties = PropertiesService.getScriptProperties();
  const apiKey = properties.getProperty('GEMINI_API_KEY');

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in Script Properties.');
  }

  const model = properties.getProperty('GEMINI_MODEL') || DEFAULT_MODEL;

  const prompt = buildMentorPrompt_(packet);

  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(model) +
    ':generateContent';

  const payload = {
    systemInstruction: {
      parts: [{
        text: [
          'You are the private UPSC answer-writing mentor for AnswerOS.',
          'Analyze only the supplied Mentor Packet.',
          'Do not invent scores, trends, weaknesses, study activity, or facts.',
          'Use the deterministic analysis and policy as evidence.',
          'Give practical answer-writing actions, not generic motivation.',
          'Keep the report concise and specific.',
          'Return JSON matching the supplied response schema.'
        ].join(' ')
      }]
    },
    contents: [{
      role: 'user',
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: MENTOR_REPORT_SCHEMA,
      temperature: 0.2
    }
  };

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-goog-api-key': apiKey
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  const raw = response.getContentText();

  if (status < 200 || status >= 300) {
    throw new Error('Gemini API error ' + status + ': ' + raw.slice(0, 800));
  }

  const data = JSON.parse(raw);
  const text = extractText_(data);

  if (!text) {
    throw new Error('Gemini returned no text content.');
  }

  const report = JSON.parse(stripJsonFence_(text));
  validateReport_(report);

  return report;
}

function buildMentorPrompt_(packet) {
  return [
    'MENTOR PACKET:',
    JSON.stringify(packet),
    '',
    'TASK:',
    'Produce the daily UPSC answer-writing mentor report.',
    'Prioritize the supplied evidence-backed actions.',
    'Do not add claims that cannot be supported by the packet.'
  ].join('\n');
}

function extractText_(data) {
  const candidates = data && data.candidates;
  if (!Array.isArray(candidates)) return '';

  for (let i = 0; i < candidates.length; i++) {
    const parts =
      candidates[i] &&
      candidates[i].content &&
      candidates[i].content.parts;

    if (!Array.isArray(parts)) continue;

    for (let j = 0; j < parts.length; j++) {
      if (parts[j] && typeof parts[j].text === 'string') {
        return parts[j].text;
      }
    }
  }

  return '';
}

function stripJsonFence_(value) {
  return String(value)
    .trim()
    .replace(/^\`\`\`json\s*/i, '')
    .replace(/^\`\`\`\s*/i, '')
    .replace(/\s*\`\`\`$/i, '')
    .trim();
}

function validateReport_(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    throw new Error('Invalid Mentor Report object.');
  }

  if (typeof report.summary !== 'string' || !report.summary.trim()) {
    throw new Error('Mentor Report summary is invalid.');
  }

  if (!Array.isArray(report.observations) || report.observations.length > 8) {
    throw new Error('Mentor Report observations are invalid.');
  }

  if (!Array.isArray(report.actions) || report.actions.length > 5) {
    throw new Error('Mentor Report actions are invalid.');
  }

  if (!report.focus || typeof report.focus !== 'object') {
    throw new Error('Mentor Report focus is invalid.');
  }

  if (
    typeof report.focus.primary !== 'string' ||
    typeof report.focus.why !== 'string' ||
    typeof report.focus.nextStep !== 'string'
  ) {
    throw new Error('Mentor Report focus fields are invalid.');
  }

  report.observations.forEach(function (item) {
    if (typeof item !== 'string' || !item.trim()) {
      throw new Error('Mentor Report contains an invalid observation.');
    }
  });

  report.actions.forEach(function (item) {
    if (
      !item ||
      typeof item.action !== 'string' ||
      typeof item.reason !== 'string'
    ) {
      throw new Error('Mentor Report contains an invalid action.');
    }
  });
}

function parseRequest_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('POST body is required.');
  }

  const parsed = JSON.parse(e.postData.contents);
  return parsed && typeof parsed === 'object' ? parsed : null;
}

function jsonOutput_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
