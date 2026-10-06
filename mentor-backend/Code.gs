/*
 * AnswerOS AI Mentor — standalone Gemini backend
 *
 * Phase 13:
 * - Secure server-side Gemini adapter intended for a SEPARATE Apps Script deployment.
 * - API key is read only from Script Properties (GEMINI_API_KEY).
 * - Mentor endpoint requires MENTOR_ACCESS_TOKEN.
 * - The file is NOT connected to the existing AnswerOS Apps Script.
 */

const MENTOR_BACKEND_VERSION = 'mentor-gemini-backend-v1';
const DEFAULT_MODEL = 'gemini-3.6-flash';

const MENTOR_REPORT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    observations: { type: 'array', items: { type: 'string' } },
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
    if (getRequestParameter_(e, 'mentorUi') === '1') {
      return handleMentorUiPost_(e);
    }
    const body=parseRequest_(e);
    if(!isAuthorized_(body)) return jsonOutput_({ok:false,error:'UNAUTHORIZED'});
    const packet=body && body.packet ? body.packet : body;
    if(!packet || typeof packet!=='object') return jsonOutput_({ok:false,error:'INVALID_PACKET'});
    const report=generateMentorReport_(packet);
    return jsonOutput_({ok:true,version:MENTOR_BACKEND_VERSION,report});
  } catch(error) {
    console.error(error && error.stack ? error.stack : error);
    return jsonOutput_({ok:false,error:'MENTOR_BACKEND_ERROR',message:error && error.message ? error.message : String(error)});
  }
}

function handleMentorUiPost_(e) {
  const accessToken=getRequestParameter_(e, 'accessToken');
  if(!isAuthorized_({accessToken})) {
    return HtmlService.createHtmlOutput(buildMentorErrorHtml_('Unauthorized','The Mentor access token was rejected. No Gemini request was made.')).setTitle('AnswerOS AI Mentor').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  const rawPacket=getRequestParameter_(e, 'packet');
  if(!rawPacket) return HtmlService.createHtmlOutput(buildMentorErrorHtml_('Missing Mentor Packet','The dashboard did not send a Mentor Packet.')).setTitle('AnswerOS AI Mentor').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  const packet=JSON.parse(rawPacket);
  if(!packet || typeof packet!=='object') return HtmlService.createHtmlOutput(buildMentorErrorHtml_('Invalid Mentor Packet','The submitted Mentor Packet could not be parsed.')).setTitle('AnswerOS AI Mentor').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  const report=generateMentorReport_(packet);
  return HtmlService.createHtmlOutput(buildMentorReportHtml_(report)).setTitle('AnswerOS AI Mentor').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getRequestParameter_(e, name) {
  if (e && e.parameter && typeof e.parameter[name] === 'string') {
    return e.parameter[name];
  }

  const raw = e && e.postData && typeof e.postData.contents === 'string'
    ? e.postData.contents
    : '';

  if (!raw) return '';

  const pairs = raw.split('&');
  for (let i = 0; i < pairs.length; i++) {
    const separator = pairs[i].indexOf('=');
    if (separator < 0) continue;

    const key = decodeURIComponent(pairs[i].slice(0, separator).replace(/\\+/g, ' '));
    if (key !== name) continue;

    return decodeURIComponent(pairs[i].slice(separator + 1).replace(/\\+/g, ' '));
  }

  return '';
}

function buildMentorReportHtml_(report) {
  const observations=report.observations.slice(0,3).map(function(item){return '<li>'+escapeHtml_(item)+'</li>';}).join('');
  const actions=report.actions.slice(0,3).map(function(item){return '<li><strong>'+escapeHtml_(item.action)+'</strong>'+(item.target?' · '+escapeHtml_(item.target):'')+'<br><span>'+escapeHtml_(item.reason)+'</span></li>';}).join('');
  return '<!doctype html><html><head><base target="_top"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:transparent;color:#18211b;margin:0;padding:22px}.wrap{max-width:760px;margin:0 auto}.hello{font-size:14px;color:#526057;margin-bottom:5px}.summary{font-size:18px;line-height:1.48;font-weight:650;background:#fff;border:1px solid #e1e7e2;border-radius:16px;padding:18px;margin:0 0 14px;box-shadow:0 4px 18px rgba(20,35,25,.04)}.card{background:#fff;border:1px solid #e1e7e2;border-radius:16px;padding:17px;margin-bottom:12px}.eyebrow{font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#2c8a46;margin-bottom:6px}h2{font-size:13px;margin:0 0 10px}ul{margin:0;padding-left:19px}li{margin:0 0 10px;line-height:1.42;font-size:14px}li:last-child{margin-bottom:0}li span{color:#526057;font-size:12.5px}.focus{border-left:4px solid #2c8a46}.focus b{display:block;font-size:19px;margin-bottom:6px}.focus div{font-size:13.5px;line-height:1.45}.next{margin-top:9px}.foot{margin-top:14px;color:#7a847d;font-size:10.5px}@media(max-width:700px){body{padding:16px}.summary{font-size:17px}}</style></head><body><main class="wrap"><div class="hello">Aishwary, here\'s what I\'d focus on today.</div><div class="summary">'+escapeHtml_(report.summary)+'</div><section class="card"><div class="eyebrow">What I\'m noticing</div><ul>'+observations+'</ul></section><section class="card"><div class="eyebrow">Your next move</div><ul>'+actions+'</ul></section><section class="card focus"><div class="eyebrow">One priority</div><b>'+escapeHtml_(report.focus.primary)+'</b><div>'+escapeHtml_(report.focus.why)+'</div><div class="next"><strong>Today:</strong> '+escapeHtml_(report.focus.nextStep)+'</div></section><div class="foot">Based on your current AnswerOS performance. Your dashboard data was not modified.</div></main></body></html>';
}

function buildMentorErrorHtml_(title,message) {
  return '<!doctype html><html><head><base target="_top"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui,sans-serif;background:#f6f8f6;padding:32px;color:#18211b}.box{max-width:700px;margin:auto;background:#fff;border:1px solid #e1e7e2;border-radius:16px;padding:24px}h1{font-size:24px}p{line-height:1.5;color:#526057}</style></head><body><div class="box"><h1>'+escapeHtml_(title)+'</h1><p>'+escapeHtml_(message)+'</p></div></body></html>';
}

function escapeHtml_(value) {
  return String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function isAuthorized_(body) {
  const expected = PropertiesService
    .getScriptProperties()
    .getProperty('MENTOR_ACCESS_TOKEN');

  if (!expected) {
    throw new Error('MENTOR_ACCESS_TOKEN is not configured in Script Properties.');
  }

  const supplied = body && typeof body.accessToken === 'string'
    ? body.accessToken
    : '';

  return supplied === expected;
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
          'Address the candidate as Aishwary and speak directly using you/your.',
          'Sound like a sharp, supportive human mentor who knows the candidate\'s work.',
          'Be concise: prioritize the few things that matter today and avoid formal report language.',
          'Return JSON matching the supplied response schema.'
        ].join(' ')
      }]
    },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: MENTOR_REPORT_SCHEMA,
      temperature: 0.2
    }
  };

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': apiKey },
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
    'Produce a concise daily UPSC answer-writing mentor message for Aishwary.',
    'Address Aishwary directly and prioritize the supplied evidence-backed actions.',
    'Do not add claims that cannot be supported by the packet.'
  ].join('\n');
}

function extractText_(data) {
  const candidates = data && data.candidates;
  if (!Array.isArray(candidates)) return '';

  for (let i = 0; i < candidates.length; i++) {
    const parts = candidates[i] && candidates[i].content && candidates[i].content.parts;
    if (!Array.isArray(parts)) continue;

    for (let j = 0; j < parts.length; j++) {
      if (parts[j] && typeof parts[j].text === 'string') return parts[j].text;
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
    if (!item || typeof item.action !== 'string' || typeof item.reason !== 'string') {
      throw new Error('Mentor Report contains an invalid action.');
    }
  });
}

function parseRequest_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('POST body is required.');
  }

  const raw = e.postData.contents;

  // Standard API clients send JSON.
  const contentType = String(e.postData.type || '').toLowerCase();
  if (contentType.indexOf('application/json') !== -1) {
    const parsedJson = JSON.parse(raw);
    return parsedJson && typeof parsedJson === 'object' ? parsedJson : null;
  }

  // Dashboard form submissions may arrive as application/x-www-form-urlencoded.
  // Normalize them into the same object shape used by the JSON API.
  const parsedForm = {};
  raw.split('&').forEach(function(pair) {
    const separator = pair.indexOf('=');
    if (separator < 0) return;

    const key = decodeURIComponent(pair.slice(0, separator).replace(/\\+/g, ' '));
    const value = decodeURIComponent(pair.slice(separator + 1).replace(/\\+/g, ' '));
    parsedForm[key] = value;
  });

  if (parsedForm.packet) {
    try {
      parsedForm.packet = JSON.parse(parsedForm.packet);
    } catch (error) {
      throw new Error('Mentor Packet form field is not valid JSON.');
    }
  }

  return parsedForm;
}

function jsonOutput_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
