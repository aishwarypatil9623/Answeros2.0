/* AnswerOS AI Mentor — deterministic analysis layer
 *
 * Phase 3:
 * - Converts Mentor Context into structured, explainable performance signals.
 * - Uses deterministic rules only; no AI provider and no UI.
 * - Does not write to AnswerOSData or Mentor Memory automatically.
 * - Designed to become the evidence layer supplied to the future AI Mentor.
 */
(function (global) {
  'use strict';

  const VERSION = 'mentor-analysis-v1';

  function finite(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function entries(object) {
    return object && typeof object === 'object'
      ? Object.keys(object).map(key => ({ key, ...object[key] }))
      : [];
  }

  function byCountThenAverage(a, b) {
    return (b.count || 0) - (a.count || 0)
      || (a.average == null ? 999 : a.average) - (b.average == null ? 999 : b.average)
      || a.key.localeCompare(b.key);
  }

  function analyzeContext(context, options) {
    const opts = options || {};
    const minimumSample = Number.isFinite(Number(opts.minimumSample))
      ? Math.max(1, Number(opts.minimumSample))
      : 3;

    if (!context || context.ok !== true) {
      return {
        version: VERSION,
        ok: false,
        reason: 'A valid Mentor Context is required.',
        signals: [],
        priorities: []
      };
    }

    const signals = [];
    const priorities = [];

    const overall = finite(context.performance && context.performance.overallAverageScore);
    const recent = finite(context.performance && context.performance.recentAverageScore);

    if (overall !== null && recent !== null) {
      const delta = Math.round((recent - overall) * 100) / 100;
      let direction = 'stable';
      if (delta >= 0.5) direction = 'improving';
      if (delta <= -0.5) direction = 'declining';

      signals.push({
        type: 'score_trend',
        status: direction,
        overallAverage: overall,
        recentAverage: recent,
        delta
      });
    }

    const subjectRows = entries(context.averages && context.averages.bySubject)
      .filter(row => row.count >= minimumSample && row.average !== null)
      .sort(byCountThenAverage);

    if (subjectRows.length) {
      const lowestSubject = subjectRows[0];
      signals.push({
        type: 'subject_performance',
        subject: lowestSubject.key,
        average: lowestSubject.average,
        sample: lowestSubject.count,
        interpretation: 'Lowest recent subject average among sufficiently sampled subjects.'
      });

      priorities.push({
        rank: priorities.length + 1,
        type: 'subject',
        key: lowestSubject.key,
        reason: 'Lowest recent subject average with an adequate sample.',
        evidence: {
          average: lowestSubject.average,
          sample: lowestSubject.count
        }
      });
    }

    const directiveRows = entries(context.averages && context.averages.byDirective)
      .filter(row => row.count >= minimumSample && row.average !== null)
      .sort(byCountThenAverage);

    if (directiveRows.length) {
      const weakestDirective = directiveRows[0];
      signals.push({
        type: 'directive_performance',
        directive: weakestDirective.key,
        average: weakestDirective.average,
        sample: weakestDirective.count,
        interpretation: 'Lowest recent directive average among sufficiently sampled directives.'
      });

      priorities.push({
        rank: priorities.length + 1,
        type: 'directive',
        key: weakestDirective.key,
        reason: 'Lowest recent directive average with an adequate sample.',
        evidence: {
          average: weakestDirective.average,
          sample: weakestDirective.count
        }
      });
    }

    const gapRows = entries(context.averages && context.averages.byGapCategory)
      .filter(row => row.count >= minimumSample && row.average !== null)
      .sort(byCountThenAverage);

    if (gapRows.length) {
      const weakestGap = gapRows[0];
      signals.push({
        type: 'gap_category',
        category: weakestGap.key,
        average: weakestGap.average,
        sample: weakestGap.count,
        interpretation: 'Lowest recent score by detected gap category among sufficiently sampled answers.'
      });

      priorities.push({
        rank: priorities.length + 1,
        type: 'gap',
        key: weakestGap.key,
        reason: 'Lowest recent performance among sufficiently sampled gap categories.',
        evidence: {
          average: weakestGap.average,
          sample: weakestGap.count
        }
      });
    }

    const gapCounts = context.distributions && context.distributions.gapCategories || {};
    const repeatedGaps = Object.keys(gapCounts)
      .map(key => ({ key, count: Number(gapCounts[key]) || 0 }))
      .filter(row => row.count >= minimumSample)
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

    if (repeatedGaps.length) {
      signals.push({
        type: 'recurrence',
        category: repeatedGaps[0].key,
        occurrences: repeatedGaps[0].count,
        interpretation: 'Most frequently detected recent gap category.'
      });
    }

    const recentAnswers = Array.isArray(context.recentAnswers)
      ? context.recentAnswers
      : [];

    const lowScoreAnswers = recentAnswers
      .filter(answer => finite(answer.score) !== null && finite(answer.max) !== null && finite(answer.max) > 0)
      .map(answer => ({
        id: answer.id,
        score: finite(answer.score),
        max: finite(answer.max),
        ratio: finite(answer.score) / finite(answer.max),
        gapCategory: answer.gapCategory || 'Unknown',
        date: answer.date || ''
      }))
      .filter(answer => answer.ratio < 0.5);

    if (lowScoreAnswers.length) {
      signals.push({
        type: 'low_score_cluster',
        count: lowScoreAnswers.length,
        threshold: 0.5,
        interpretation: 'Recent sampled answers scoring below 50% of their recorded maximum.'
      });
    }

    const normalizedPriorities = priorities
      .slice(0, 3)
      .map((priority, index) => ({
        ...priority,
        rank: index + 1,
        urgency: clamp(1 - ((priority.evidence && priority.evidence.average || 0) / 10), 0, 1)
      }));

    return {
      version: VERSION,
      ok: true,
      generatedAt: new Date().toISOString(),
      evidence: {
        totalAnswers: context.window && context.window.totalAnswers || 0,
        recentAnswers: context.window && context.window.recentAnswers || 0,
        recentDays: context.window && context.window.recentDays || null,
        overallAverage: overall,
        recentAverage: recent,
        minimumSample
      },
      signals,
      priorities: normalizedPriorities
    };
  }

  global.AnswerOSMentorAnalysis = {
    VERSION,
    analyzeContext
  };
})(window);
