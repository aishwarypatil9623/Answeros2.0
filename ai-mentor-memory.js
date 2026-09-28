/* AnswerOS AI Mentor — isolated memory layer
 *
 * Phase 2:
 * - Owns Mentor-specific persistent state in a dedicated localStorage namespace.
 * - Does not touch AnswerOSData, Google Sheets, Apps Script, or dashboard state.
 * - Stores structured observations, recommendations, outcomes, and priorities.
 * - Safe to load independently; no UI and no AI provider dependency.
 */
(function (global) {
  'use strict';

  const VERSION = 'mentor-memory-v1';
  const STORAGE_KEY = 'answeros_mentor_memory_v1';

  const EMPTY_MEMORY = {
    version: VERSION,
    updatedAt: null,
    observations: [],
    weaknesses: [],
    recommendations: [],
    outcomes: [],
    priorities: [],
    notes: []
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function storageAvailable() {
    try {
      return typeof global.localStorage !== 'undefined';
    } catch (error) {
      return false;
    }
  }

  function normalize(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    return {
      version: VERSION,
      updatedAt: source.updatedAt || null,
      observations: Array.isArray(source.observations) ? source.observations : [],
      weaknesses: Array.isArray(source.weaknesses) ? source.weaknesses : [],
      recommendations: Array.isArray(source.recommendations) ? source.recommendations : [],
      outcomes: Array.isArray(source.outcomes) ? source.outcomes : [],
      priorities: Array.isArray(source.priorities) ? source.priorities : [],
      notes: Array.isArray(source.notes) ? source.notes : []
    };
  }

  function read() {
    if (!storageAvailable()) return clone(EMPTY_MEMORY);

    try {
      const raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return clone(EMPTY_MEMORY);
      return normalize(JSON.parse(raw));
    } catch (error) {
      return clone(EMPTY_MEMORY);
    }
  }

  function write(memory) {
    const next = normalize(memory);
    next.updatedAt = new Date().toISOString();

    if (storageAvailable()) {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }

    return clone(next);
  }

  function clear() {
    if (storageAvailable()) {
      global.localStorage.removeItem(STORAGE_KEY);
    }
    return clone(EMPTY_MEMORY);
  }

  function addObservation(observation) {
    const memory = read();
    memory.observations.push({
      id: observation && observation.id || 'obs-' + Date.now(),
      createdAt: observation && observation.createdAt || new Date().toISOString(),
      ...observation
    });
    return write(memory);
  }

  function upsertWeakness(weakness) {
    const memory = read();
    const item = {
      status: 'active',
      confidence: null,
      occurrences: 1,
      firstDetected: new Date().toISOString(),
      lastDetected: new Date().toISOString(),
      trend: 'new',
      ...weakness
    };

    const index = memory.weaknesses.findIndex(
      entry => entry.key && item.key && entry.key === item.key
    );

    if (index >= 0) {
      memory.weaknesses[index] = {
        ...memory.weaknesses[index],
        ...item,
        lastDetected: item.lastDetected || new Date().toISOString()
      };
    } else {
      memory.weaknesses.push(item);
    }

    return write(memory);
  }

  function addRecommendation(recommendation) {
    const memory = read();
    memory.recommendations.push({
      id: recommendation && recommendation.id || 'rec-' + Date.now(),
      createdAt: recommendation && recommendation.createdAt || new Date().toISOString(),
      status: 'open',
      ...recommendation
    });
    return write(memory);
  }

  function recordOutcome(outcome) {
    const memory = read();
    memory.outcomes.push({
      id: outcome && outcome.id || 'out-' + Date.now(),
      createdAt: outcome && outcome.createdAt || new Date().toISOString(),
      ...outcome
    });
    return write(memory);
  }

  function setPriorities(priorities) {
    const memory = read();
    memory.priorities = Array.isArray(priorities) ? priorities : [];
    return write(memory);
  }

  global.AnswerOSMentorMemory = {
    VERSION,
    STORAGE_KEY,
    read,
    write,
    clear,
    addObservation,
    upsertWeakness,
    addRecommendation,
    recordOutcome,
    setPriorities
  };
})(window);
