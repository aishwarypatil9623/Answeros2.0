/* AnswerOS AI Mentor — isolated orchestrator
 *
 * Phase 5:
 * - Connects the isolated Context, Analysis, Policy, and Memory modules.
 * - Produces one deterministic Mentor packet from live AnswerOS data.
 * - Read-only by default: no memory writes, no UI changes, no network calls.
 * - This is the hand-off boundary for the future Gemini provider.
 */
(function (global) {
  'use strict';

  const VERSION = 'mentor-orchestrator-v1';

  function unavailable(name) {
    return {
      version: VERSION,
      ok: false,
      reason: name + ' is unavailable.'
    };
  }

  function buildPacket(options) {
    const opts = options || {};

    if (!global.AnswerOSMentor || typeof global.AnswerOSMentor.buildMentorContext !== 'function') {
      return unavailable('AnswerOSMentor');
    }

    if (!global.AnswerOSMentorAnalysis || typeof global.AnswerOSMentorAnalysis.analyzeContext !== 'function') {
      return unavailable('AnswerOSMentorAnalysis');
    }

    if (!global.AnswerOSMentorPolicy || typeof global.AnswerOSMentorPolicy.buildPlan !== 'function') {
      return unavailable('AnswerOSMentorPolicy');
    }

    const context = global.AnswerOSMentor.buildMentorContext({
      recentDays: opts.recentDays,
      now: opts.now
    });

    if (!context.ok) {
      return {
        version: VERSION,
        ok: false,
        stage: 'context',
        context
      };
    }

    const analysis = global.AnswerOSMentorAnalysis.analyzeContext(
      context,
      { minimumSample: opts.minimumSample }
    );

    if (!analysis.ok) {
      return {
        version: VERSION,
        ok: false,
        stage: 'analysis',
        context,
        analysis
      };
    }

    const plan = global.AnswerOSMentorPolicy.buildPlan(
      analysis,
      { maxActions: opts.maxActions }
    );

    const memory = global.AnswerOSMentorMemory &&
      typeof global.AnswerOSMentorMemory.read === 'function'
      ? global.AnswerOSMentorMemory.read()
      : null;

    const promptPayload =
      typeof global.AnswerOSMentorPolicy.buildPromptPayload === 'function'
        ? global.AnswerOSMentorPolicy.buildPromptPayload(context, analysis, plan)
        : null;

    return {
      version: VERSION,
      ok: true,
      generatedAt: new Date().toISOString(),
      context,
      analysis,
      plan,
      memory,
      promptPayload,
      provider: {
        connected: false,
        name: null,
        networkCallMade: false
      }
    };
  }

  global.AnswerOSMentorOrchestrator = {
    VERSION,
    buildPacket
  };
})(window);
