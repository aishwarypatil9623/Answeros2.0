/* AnswerOS AI Mentor — isolated self-test
 *
 * Phase 8:
 * - Tests the Mentor policy and report validator without touching live AnswerOS data.
 * - Uses synthetic fixtures only.
 * - Does not run automatically and makes no network requests.
 */
(function (global) {
  'use strict';

  const VERSION = 'mentor-self-test-v1';

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function run() {
    const results = [];

    function test(name, fn) {
      try {
        fn();
        results.push({ name, ok: true });
      } catch (error) {
        results.push({
          name,
          ok: false,
          error: error && error.message ? error.message : String(error)
        });
      }
    }

    assert(
      global.AnswerOSMentorPolicy &&
      typeof global.AnswerOSMentorPolicy.buildPlan === 'function',
      'AnswerOSMentorPolicy is unavailable.'
    );

    assert(
      global.AnswerOSMentorValidator &&
      typeof global.AnswerOSMentorValidator.validate === 'function',
      'AnswerOSMentorValidator is unavailable.'
    );

    test('Policy creates a subject action from evidence', function () {
      const analysis = {
        ok: true,
        priorities: [{
          rank: 1,
          type: 'subject',
          key: 'Polity',
          evidence: { average: 5.2, sample: 6 }
        }],
        signals: []
      };

      const plan = global.AnswerOSMentorPolicy.buildPlan(analysis, {
        maxActions: 3
      });

      assert(plan.ok === true, 'Plan should be valid.');
      assert(plan.actions.length === 1, 'Expected one action.');
      assert(plan.actions[0].action === 'subject_focus', 'Expected subject_focus.');
      assert(plan.actions[0].target === 'Polity', 'Expected Polity target.');
    });

    test('Policy falls back to recent-answer review', function () {
      const plan = global.AnswerOSMentorPolicy.buildPlan({
        ok: true,
        priorities: [],
        signals: []
      });

      assert(plan.ok === true, 'Plan should be valid.');
      assert(plan.actions.length === 1, 'Expected fallback action.');
      assert(
        plan.actions[0].action === 'review_recent_answers',
        'Expected review_recent_answers.'
      );
    });

    test('Policy adds review when score trend is declining', function () {
      const plan = global.AnswerOSMentorPolicy.buildPlan({
        ok: true,
        priorities: [{
          rank: 1,
          type: 'gap',
          key: 'Critical Analysis',
          evidence: { average: 4.8, sample: 5 }
        }],
        signals: [{
          type: 'score_trend',
          status: 'declining',
          delta: -0.8
        }]
      }, { maxActions: 2 });

      assert(plan.actions.length === 2, 'Expected two bounded actions.');
      assert(
        plan.actions[1].action === 'review_recent_answers',
        'Expected review action for declining trend.'
      );
    });

    test('Validator accepts a correctly structured report', function () {
      const report = global.AnswerOSMentorValidator.validate({
        summary: 'Recent performance shows a recurring answer-writing gap.',
        observations: ['Critical Analysis is recurring in recent answers.'],
        actions: [{
          action: 'gap_drill',
          reason: 'The detected gap has repeated recently.',
          target: 'Critical Analysis'
        }],
        focus: {
          primary: 'Critical Analysis',
          why: 'It is a recurring detected gap.',
          nextStep: 'Write one answer and explicitly strengthen the analytical section.'
        }
      });

      assert(report.ok === true, 'Valid report should pass.');
      assert(report.report.actions.length === 1, 'Expected one validated action.');
    });

    test('Validator rejects missing required fields', function () {
      const report = global.AnswerOSMentorValidator.validate({
        summary: 'Incomplete report'
      });

      assert(report.ok === false, 'Incomplete report should fail.');
      assert(report.errors.length >= 1, 'Expected validation errors.');
    });

    test('Validator rejects excessive action count', function () {
      const actions = Array.from({ length: 6 }, (_, index) => ({
        action: 'action_' + index,
        reason: 'Evidence-backed reason.',
        target: 'Target'
      }));

      const report = global.AnswerOSMentorValidator.validate({
        summary: 'Too many actions.',
        observations: ['Observation'],
        actions,
        focus: {
          primary: 'Focus',
          why: 'Reason',
          nextStep: 'Next step'
        }
      });

      assert(report.ok === false, 'Excessive actions should fail.');
    });

    const passed = results.filter(result => result.ok).length;
    const failed = results.length - passed;

    return {
      version: VERSION,
      ok: failed === 0,
      passed,
      failed,
      total: results.length,
      results
    };
  }

  global.AnswerOSMentorSelfTest = {
    VERSION,
    run
  };
})(window);
