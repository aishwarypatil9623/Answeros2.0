(function (global) {
  'use strict';

  const VERSION = 'mentor-live-test-v1';

  function run(options) {
    if (!global.AnswerOSMentorLiveClient ||
        typeof global.AnswerOSMentorLiveClient.buildRealMentorPacket !== 'function') {
      throw new Error('AnswerOSMentorLiveClient is unavailable.');
    }

    const packet = global.AnswerOSMentorLiveClient.buildRealMentorPacket(options || {});

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

  global.AnswerOSMentorLiveTest = {
    VERSION,
    run
  };
})(window);
