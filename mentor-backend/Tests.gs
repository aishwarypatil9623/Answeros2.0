/*
 * AnswerOS AI Mentor — backend dry-run tests
 *
 * Phase 10:
 * - Tests the standalone Gemini backend without calling Gemini.
 * - Safe to run manually in the separate Mentor Apps Script project.
 * - Does not require GEMINI_API_KEY.
 */

function runMentorBackendTests() {
  const results = [];

  testMentorBackend_(
    results,
    'Prompt builder includes supplied packet',
    function () {
      const packet = {
        analysis: {
          priorities: [{
            type: 'subject',
            key: 'Polity',
            evidence: { average: 5.2, sample: 6 }
          }]
        }
      };

      const prompt = buildMentorPrompt_(packet);

      assertMentorBackend_(
        prompt.indexOf('"Polity"') !== -1,
        'Prompt did not include the supplied packet.'
      );
    }
  );

  testMentorBackend_(
    results,
    'Validator accepts valid report',
    function () {
      validateReport_({
        summary: 'Recent answers show a recurring analytical gap.',
        observations: ['Critical Analysis appears repeatedly in the supplied evidence.'],
        actions: [{
          action: 'gap_drill',
          reason: 'The supplied analysis identifies a recurring gap.',
          target: 'Critical Analysis'
        }],
        focus: {
          primary: 'Critical Analysis',
          why: 'It is repeatedly detected in the supplied evidence.',
          nextStep: 'Write one answer and explicitly strengthen analytical reasoning.'
        }
      });
    }
  );

  testMentorBackend_(
    results,
    'Validator rejects incomplete report',
    function () {
      let rejected = false;

      try {
        validateReport_({
          summary: 'Incomplete'
        });
      } catch (error) {
        rejected = true;
      }

      assertMentorBackend_(
        rejected,
        'Incomplete report was not rejected.'
      );
    }
  );

  testMentorBackend_(
    results,
    'No API key is needed for dry-run tests',
    function () {
      const packet = {
        analysis: { priorities: [] },
        plan: { actions: [] }
      };

      const prompt = buildMentorPrompt_(packet);

      assertMentorBackend_(
        typeof prompt === 'string' && prompt.length > 0,
        'Dry-run prompt generation failed.'
      );
    }
  );

  const passed = results.filter(function (result) {
    return result.ok;
  }).length;

  const summary = {
    ok: passed === results.length,
    passed: passed,
    failed: results.length - passed,
    total: results.length,
    results: results
  };

  console.log('AI Mentor Backend Tests');
  console.log('Passed: ' + summary.passed);
  console.log('Failed: ' + summary.failed);
  console.log('Total: ' + summary.total);
  console.log('Status: ' + (summary.ok ? 'PASS' : 'FAIL'));
  console.log(JSON.stringify(summary.results));

  return summary;
}

function testMentorBackend_(results, name, fn) {
  try {
    fn();
    results.push({
      name: name,
      ok: true
    });
  } catch (error) {
    results.push({
      name: name,
      ok: false,
      error: error && error.message ? error.message : String(error)
    });
  }
}

function assertMentorBackend_(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}


/*
 * Live Gemini smoke test.
 * Requires GEMINI_API_KEY and GEMINI_MODEL in Script Properties.
 * Uses a tiny synthetic Mentor Packet and makes one Gemini request.
 */
function runMentorLiveTest() {
  const packet = {
    analysis: {
      scoreTrend: 'improving',
      priorities: [{
        type: 'gap',
        key: 'analytical_depth',
        evidence: { average: 5.4, sample: 6 }
      }]
    },
    plan: {
      actions: [{
        action: 'gap_drill',
        reason: 'Analytical depth is the strongest recurring evidence-backed gap.',
        target: 'analytical_depth'
      }]
    },
    memory: {
      activeWeaknesses: ['analytical_depth']
    }
  };

  const report = generateMentorReport_(packet);

  console.log('AI Mentor Live Gemini Test');
  console.log('Status: PASS');
  console.log('Model: ' + (PropertiesService.getScriptProperties().getProperty('GEMINI_MODEL') || DEFAULT_MODEL));
  console.log(JSON.stringify(report, null, 2));

  return report;
}
