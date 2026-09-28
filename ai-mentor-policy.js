/* AnswerOS AI Mentor — decision policy layer
 *
 * Phase 4:
 * - Converts deterministic analysis into bounded mentor actions.
 * - Keeps recommendations evidence-based and explainable.
 * - Does not call an AI provider, write memory, or alter AnswerOS.
 * - Intended as the safety/structure layer before Gemini generates language.
 */
(function (global) {
  'use strict';

  const VERSION = 'mentor-policy-v1';

  const ACTIONS = {
    SUBJECT: 'subject_focus',
    DIRECTIVE: 'directive_drill',
    GAP: 'gap_drill',
    REVIEW: 'review_recent_answers',
    MAINTAIN: 'maintain_current_routine'
  };

  function finite(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function unique(list) {
    return Array.from(new Set(list.filter(Boolean)));
  }

  function chooseAction(priority) {
    if (!priority) return null;

    if (priority.type === 'subject') {
      return {
        action: ACTIONS.SUBJECT,
        target: priority.key,
        instruction: 'Allocate a focused practice block to the lowest-performing subject.'
      };
    }

    if (priority.type === 'directive') {
      return {
        action: ACTIONS.DIRECTIVE,
        target: priority.key,
        instruction: 'Practice answers using the weakest directive and explicitly check whether its demand is being fulfilled.'
      };
    }

    if (priority.type === 'gap') {
      return {
        action: ACTIONS.GAP,
        target: priority.key,
        instruction: 'Run a targeted drill on the recurring answer-writing gap category.'
      };
    }

    return null;
  }

  function buildPlan(analysis, options) {
    const opts = options || {};
    const maxActions = Number.isFinite(Number(opts.maxActions))
      ? Math.max(1, Math.min(5, Number(opts.maxActions)))
      : 3;

    if (!analysis || analysis.ok !== true) {
      return {
        version: VERSION,
        ok: false,
        reason: 'A valid Mentor Analysis is required.',
        actions: []
      };
    }

    const actions = [];

    (analysis.priorities || []).slice(0, maxActions).forEach(priority => {
      const action = chooseAction(priority);
      if (action) {
        actions.push({
          rank: actions.length + 1,
          source: priority.type,
          evidence: priority.evidence || {},
          ...action
        });
      }
    });

    const trend = (analysis.signals || []).find(signal => signal.type === 'score_trend');

    if (actions.length === 0) {
      actions.push({
        rank: 1,
        action: ACTIONS.REVIEW,
        target: 'recent_answers',
        instruction: 'Review recent answers and identify one concrete improvement to apply in the next answer.'
      });
    }

    if (trend && trend.status === 'declining' && actions.length < maxActions) {
      actions.push({
        rank: actions.length + 1,
        action: ACTIONS.REVIEW,
        target: 'recent_answers',
        instruction: 'Review recent lower-scoring answers before adding new workload.'
      });
    }

    return {
      version: VERSION,
      ok: true,
      generatedAt: new Date().toISOString(),
      actions: actions.slice(0, maxActions),
      constraints: {
        maxActions,
        noAutomaticDataMutation: true,
        evidenceRequired: true
      }
    };
  }

  function buildPromptPayload(context, analysis, plan) {
    return {
      version: VERSION,
      purpose: 'UPSC answer-writing mentorship',
      rules: [
        'Use only supplied AnswerOS evidence for performance claims.',
        'Do not invent scores, weaknesses, trends, or study activity.',
        'Do not produce more than the supplied action limit.',
        'Separate observed evidence from recommendations.',
        'Prefer specific, executable actions over generic motivation.'
      ],
      context: context || null,
      analysis: analysis || null,
      plan: plan || null
    };
  }

  global.AnswerOSMentorPolicy = {
    VERSION,
    ACTIONS,
    buildPlan,
    buildPromptPayload
  };
})(window);
