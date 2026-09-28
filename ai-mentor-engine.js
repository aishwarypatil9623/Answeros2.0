/* AnswerOS AI Mentor — isolated foundation
 *
 * Phase 1:
 * - READ-ONLY adapter over the existing AnswerOSData API.
 * - Builds compact, deterministic mentor context from real answer data.
 * - Does not call an AI provider.
 * - Does not modify the dashboard, Apps Script, or synced answer data.
 *
 * This file is intentionally not loaded by production pages yet.
 */
(function (global) {
  'use strict';

  const VERSION = 'mentor-foundation-v1';

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function finiteNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function daysAgo(dateValue, now) {
    if (!dateValue) return null;
    const d = new Date(dateValue);
    if (Number.isNaN(d.getTime())) return null;
    const diff = now.getTime() - d.getTime();
    return Math.floor(diff / 86400000);
  }

  function average(values) {
    const nums = values.map(finiteNumber).filter(v => v !== null);
    if (!nums.length) return null;
    return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
  }

  function countBy(rows, key) {
    return rows.reduce((out, row) => {
      const value = String(row && row[key] || '').trim() || 'Unknown';
      out[value] = (out[value] || 0) + 1;
      return out;
    }, {});
  }

  function averageBy(rows, groupKey, valueKey) {
    const buckets = {};
    rows.forEach(row => {
      const group = String(row && row[groupKey] || '').trim() || 'Unknown';
      const value = finiteNumber(row && row[valueKey]);
      if (value === null) return;
      if (!buckets[group]) buckets[group] = [];
      buckets[group].push(value);
    });

    return Object.keys(buckets).reduce((out, key) => {
      out[key] = {
        count: buckets[key].length,
        average: average(buckets[key])
      };
      return out;
    }, {});
  }

  function sortCounts(counts) {
    return Object.keys(counts)
      .map(key => ({ key, count: counts[key] }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  }

  function buildMentorContext(options) {
    const opts = options || {};
    const now = opts.now instanceof Date ? opts.now : new Date();

    if (!global.AnswerOSData || typeof global.AnswerOSData.getAnswers !== 'function') {
      return {
        version: VERSION,
        ok: false,
        reason: 'AnswerOSData.getAnswers() is unavailable.',
        generatedAt: now.toISOString()
      };
    }

    const allAnswers = safeArray(global.AnswerOSData.getAnswers());
    const recentDays = Number.isFinite(Number(opts.recentDays))
      ? Math.max(1, Number(opts.recentDays))
      : 30;

    const recentAnswers = allAnswers.filter(answer => {
      const age = daysAgo(answer && answer.date, now);
      return age !== null && age >= 0 && age < recentDays;
    });

    const scored = allAnswers.filter(answer => finiteNumber(answer && answer.score) !== null);
    const recentScored = recentAnswers.filter(answer => finiteNumber(answer && answer.score) !== null);

    const context = {
      version: VERSION,
      ok: true,
      generatedAt: now.toISOString(),
      window: {
        recentDays,
        totalAnswers: allAnswers.length,
        recentAnswers: recentAnswers.length
      },
      performance: {
        overallAverageScore: average(scored.map(a => a.score)),
        recentAverageScore: average(recentScored.map(a => a.score)),
        scoredAnswers: scored.length,
        recentScoredAnswers: recentScored.length
      },
      distributions: {
        papers: countBy(recentAnswers, 'paper'),
        subjects: countBy(recentAnswers, 'subject'),
        sources: countBy(recentAnswers, 'source'),
        directives: countBy(recentAnswers, 'directive'),
        gapCategories: countBy(recentAnswers, 'gapCategory')
      },
      averages: {
        byPaper: averageBy(recentAnswers, 'paper', 'score'),
        bySubject: averageBy(recentAnswers, 'subject', 'score'),
        byDirective: averageBy(recentAnswers, 'directive', 'score'),
        byGapCategory: averageBy(recentAnswers, 'gapCategory', 'score')
      },
      recentAnswers: recentAnswers.slice(0, 20).map(answer => ({
        id: answer.id || '',
        date: answer.date || '',
        paper: answer.paper || '',
        subject: answer.subject || '',
        source: answer.source || '',
        subtopic: answer.subtopic || '',
        directive: answer.directive || '',
        score: finiteNumber(answer.score),
        marks: finiteNumber(answer.marks),
        max: finiteNumber(answer.max),
        demandPct: finiteNumber(answer.demandPct),
        wordCount: finiteNumber(answer.wordCount),
        gapCategory: answer.gapCategory || '',
        feedback: {
          strength: answer.feedback && answer.feedback.strength || '',
          gap: answer.feedback && answer.feedback.gap || '',
          fix: answer.feedback && answer.feedback.fix || ''
        },
        improvements: safeArray(answer.improvements).slice(0, 5),
        learning: answer.learning || ''
      }))
    };

    return context;
  }

  function getVersion() {
    return VERSION;
  }

  global.AnswerOSMentor = {
    VERSION,
    getVersion,
    buildMentorContext
  };
})(window);
