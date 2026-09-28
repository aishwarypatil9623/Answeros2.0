/* AnswerOS AI Mentor — provider boundary
 *
 * Phase 6:
 * - Defines the provider interface for the future Gemini-backed Mentor.
 * - Accepts the structured Mentor Packet produced by the orchestrator.
 * - Does NOT contain an API key.
 * - Does NOT make network requests.
 * - Does NOT choose a Gemini model.
 * - Does NOT modify AnswerOS data, memory, or UI.
 *
 * A future secure backend/Apps Script endpoint can implement the actual
 * provider call behind this boundary without exposing credentials in the
 * browser.
 */
(function (global) {
  'use strict';

  const VERSION = 'mentor-provider-boundary-v1';

  const RESPONSE_SCHEMA = {
    type: 'object',
    required: ['summary', 'observations', 'actions', 'focus'],
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
          required: ['action', 'reason'],
          properties: {
            action: { type: 'string' },
            reason: { type: 'string' },
            target: { type: 'string' }
          }
        }
      },
      focus: {
        type: 'object',
        required: ['primary', 'why', 'nextStep'],
        properties: {
          primary: { type: 'string' },
          why: { type: 'string' },
          nextStep: { type: 'string' }
        }
      }
    }
  };

  function createRequest(packet, options) {
    const opts = options || {};

    return {
      version: VERSION,
      task: 'Generate a concise UPSC answer-writing mentorship report from the supplied evidence.',
      constraints: [
        'Use only the supplied Mentor Packet as evidence.',
        'Do not invent scores, trends, weaknesses, or study activity.',
        'Do not produce political persuasion or unrelated advice.',
        'Do not exceed the supplied action limit.',
        'Return JSON matching the supplied response schema.',
        'Distinguish observations from recommendations.'
      ],
      responseSchema: RESPONSE_SCHEMA,
      packet: packet || null,
      options: {
        maxActions: Number.isFinite(Number(opts.maxActions))
          ? Math.max(1, Math.min(5, Number(opts.maxActions)))
          : 3
      }
    };
  }

  function unavailableReason() {
    return {
      code: 'PROVIDER_NOT_CONNECTED',
      message: 'No AI provider is connected. This browser-side boundary intentionally performs no network request.'
    };
  }

  async function generate() {
    return {
      version: VERSION,
      ok: false,
      provider: null,
      networkCallMade: false,
      error: unavailableReason()
    };
  }

  global.AnswerOSMentorProvider = {
    VERSION,
    RESPONSE_SCHEMA,
    createRequest,
    generate
  };
})(window);
