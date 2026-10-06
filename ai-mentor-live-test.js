(function (global) {
  'use strict';

  const VERSION = 'mentor-live-test-v1';

  function requireClient_() {
    if (!global.AnswerOSMentorLiveClient) {
      throw new Error('AnswerOSMentorLiveClient is unavailable.');
    }
    return global.AnswerOSMentorLiveClient;
  }

  function run(options) {
    const client = requireClient_();
    const packet = client.buildRealMentorPacket(options || {});

    if (!packet || packet.ok !== true) {
      throw new Error('Real Mentor Packet could not be built.');
    }

    return {
      version: VERSION,
      ok: true,
      generatedAt: new Date().toISOString(),
      packet: packet
    };
  }

  async function runLive(backendUrl, accessToken, options) {
    const client = requireClient_();

    if (typeof client.sendMentorPacket !== 'function') {
      throw new Error('AnswerOSMentorLiveClient.sendMentorPacket is unavailable.');
    }

    const result = await client.sendMentorPacket(
      backendUrl,
      accessToken,
      options || {}
    );

    return {
      version: VERSION,
      ok: true,
      generatedAt: new Date().toISOString(),
      result: result
    };
  }

  global.AnswerOSMentorLiveTest = {
    VERSION,
    run
  };
})(window);
