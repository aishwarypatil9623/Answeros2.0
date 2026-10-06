/* AnswerOS AI Mentor — isolated live client
 *
 * Phase 11:
 * - Builds a real Mentor Packet from the existing AnswerOS data layer.
 * - Sends the packet to the standalone Mentor Web App.
 * - Does not modify AnswerOS data, dashboard state, Sheet data, or Apps Script.
 * - Not loaded by production pages yet.
 *
 * Configure the backend URL explicitly when calling sendMentorPacket().
 */
(function (global) {
  'use strict';

  const VERSION = 'mentor-live-client-v1';

  function buildRealMentorPacket(options) {
    if (!global.AnswerOSMentorOrchestrator ||
        typeof global.AnswerOSMentorOrchestrator.buildPacket !== 'function') {
      throw new Error('AnswerOSMentorOrchestrator is unavailable.');
    }

    const packet = global.AnswerOSMentorOrchestrator.buildPacket(options || {});
    if (!packet || packet.ok !== true) {
      throw new Error('Unable to build a valid Mentor Packet.');
    }

    return packet;
  }

  function validateResponse_(payload) {
    if (!payload || payload.ok !== true || !payload.report) {
      throw new Error(
        payload && payload.message
          ? payload.message
          : 'Mentor backend returned an invalid response.'
      );
    }

    const report = payload.report;
    if (typeof report.summary !== 'string' || !report.summary.trim()) {
      throw new Error('Mentor backend returned an invalid summary.');
    }
    if (!Array.isArray(report.observations) || !Array.isArray(report.actions)) {
      throw new Error('Mentor backend returned invalid report arrays.');
    }
    if (!report.focus || typeof report.focus !== 'object') {
      throw new Error('Mentor backend returned an invalid focus object.');
    }

    return report;
  }

  async function sendMentorPacket(backendUrl, options) {
    if (!backendUrl || typeof backendUrl !== 'string') {
      throw new Error('A Mentor backend Web App URL is required.');
    }

    const packet = buildRealMentorPacket(options);
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packet })
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error('Mentor backend HTTP ' + response.status + '.');
    }

    return {
      version: VERSION,
      ok: true,
      report: validateResponse_(payload),
      backendVersion: payload.version || null
    };
  }

  global.AnswerOSMentorLiveClient = {
    VERSION,
    buildRealMentorPacket,
    sendMentorPacket
  };
})(window);
