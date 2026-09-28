/* AnswerOS AI Mentor — report validation layer
 *
 * Phase 7:
 * - Validates an AI-generated Mentor Report before it can be persisted.
 * - Normalizes only the fields explicitly allowed by the provider schema.
 * - Rejects malformed structure instead of silently accepting it.
 * - Does not call an AI provider or write Mentor Memory.
 */
(function (global) {
  'use strict';

  const VERSION = 'mentor-validator-v1';
  const MAX_SUMMARY_LENGTH = 1200;
  const MAX_TEXT_LENGTH = 500;
  const MAX_ACTIONS = 5;
  const MAX_OBSERVATIONS = 8;

  function text(value, maxLength) {
    if (typeof value !== 'string') return null;
    const valueTrimmed = value.trim();
    if (!valueTrimmed || valueTrimmed.length > maxLength) return null;
    return valueTrimmed;
  }

  function validateActions(actions) {
    if (!Array.isArray(actions) || actions.length > MAX_ACTIONS) {
      return null;
    }

    const normalized = [];

    for (const action of actions) {
      if (!action || typeof action !== 'object') return null;

      const actionName = text(action.action, MAX_TEXT_LENGTH);
      const reason = text(action.reason, MAX_TEXT_LENGTH);
      const target = action.target == null
        ? ''
        : text(action.target, MAX_TEXT_LENGTH);

      if (!actionName || !reason || target === null) return null;

      normalized.push({
        action: actionName,
        reason,
        ...(target ? { target } : {})
      });
    }

    return normalized;
  }

  function validateObservations(observations) {
    if (!Array.isArray(observations) || observations.length > MAX_OBSERVATIONS) {
      return null;
    }

    const normalized = [];

    for (const observation of observations) {
      const value = text(observation, MAX_TEXT_LENGTH);
      if (!value) return null;
      normalized.push(value);
    }

    return normalized;
  }

  function validateFocus(focus) {
    if (!focus || typeof focus !== 'object') return null;

    const primary = text(focus.primary, MAX_TEXT_LENGTH);
    const why = text(focus.why, MAX_TEXT_LENGTH);
    const nextStep = text(focus.nextStep, MAX_TEXT_LENGTH);

    if (!primary || !why || !nextStep) return null;

    return {
      primary,
      why,
      nextStep
    };
  }

  function validate(report) {
    if (!report || typeof report !== 'object' || Array.isArray(report)) {
      return {
        ok: false,
        version: VERSION,
        errors: ['Report must be an object.']
      };
    }

    const errors = [];
    const summary = text(report.summary, MAX_SUMMARY_LENGTH);
    const observations = validateObservations(report.observations);
    const actions = validateActions(report.actions);
    const focus = validateFocus(report.focus);

    if (!summary) errors.push('summary is missing or invalid.');
    if (!observations) errors.push('observations is missing or invalid.');
    if (!actions) errors.push('actions is missing or invalid.');
    if (!focus) errors.push('focus is missing or invalid.');

    if (errors.length) {
      return {
        ok: false,
        version: VERSION,
        errors
      };
    }

    return {
      ok: true,
      version: VERSION,
      report: {
        summary,
        observations,
        actions,
        focus
      }
    };
  }

  global.AnswerOSMentorValidator = {
    VERSION,
    validate
  };
})(window);
