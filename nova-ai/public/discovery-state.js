((root, factory) => {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.EyrionDiscoveryState = api;
})(typeof globalThis === "undefined" ? this : globalThis, () => {
  "use strict";
  const KEY = "eyrion-discovery-progress-v1";
  const ACTIVITY_IDS = Object.freeze(["riddle", "quiz", "memory", "word", "story", "guess", "daily"]);
  const DAY_CHALLENGES = Object.freeze(["riddle", "guess", "quiz", "story"]);
  const EMPTY = () => ({ lastDay: "", streak: 0, total: 0, counts: {}, badges: [], history: [] });

  function localDay(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function dayOrdinal(day) {
    const [year, month, date] = String(day).split("-").map(Number);
    if (!year || !month || !date) return Number.NaN;
    return Math.floor(Date.UTC(year, month - 1, date) / 86400000);
  }

  function read(storage) {
    try {
      const raw = storage?.getItem(KEY);
      const value = raw ? JSON.parse(raw) : null;
      if (!value || typeof value !== "object" || Array.isArray(value)) return EMPTY();
      const counts = {};
      for (const id of ACTIVITY_IDS) counts[id] = Math.max(0, Number(value.counts?.[id]) || 0);
      return {
        lastDay: typeof value.lastDay === "string" ? value.lastDay : "",
        streak: Math.max(0, Number(value.streak) || 0),
        total: Math.max(0, Number(value.total) || 0),
        counts,
        badges: Array.isArray(value.badges) ? value.badges.filter((id) => ["first", "streak3", "explorer5"].includes(id)) : [],
        history: Array.isArray(value.history) ? value.history.filter((item) => item && ACTIVITY_IDS.includes(item.id) && typeof item.day === "string").slice(0, 12) : []
      };
    } catch {
      return EMPTY();
    }
  }

  function dailyChallenge(date = new Date()) {
    const day = localDay(date);
    const offset = dayOrdinal(day);
    return DAY_CHALLENGES[((offset % DAY_CHALLENGES.length) + DAY_CHALLENGES.length) % DAY_CHALLENGES.length];
  }

  function recommend(state, ids = ACTIVITY_IDS.filter((id) => id !== "daily")) {
    const list = ids.filter((id) => ACTIVITY_IDS.includes(id));
    if (!list.length) return null;
    const min = Math.min(...list.map((id) => Number(state?.counts?.[id]) || 0));
    const leastUsed = list.filter((id) => (Number(state?.counts?.[id]) || 0) === min);
    const todayIndex = dayOrdinal(localDay()) % leastUsed.length;
    return leastUsed[(todayIndex + leastUsed.length) % leastUsed.length];
  }

  function record(storage, id, date = new Date()) {
    if (!ACTIVITY_IDS.includes(id)) return read(storage);
    const state = read(storage);
    const day = localDay(date);
    if (state.lastDay !== day) {
      const consecutive = state.lastDay && dayOrdinal(day) - dayOrdinal(state.lastDay) === 1;
      state.streak = consecutive ? state.streak + 1 : 1;
      state.lastDay = day;
    }
    state.total += 1;
    state.counts[id] = (state.counts[id] || 0) + 1;
    state.history.unshift({ id, day });
    state.history = state.history.slice(0, 12);
    if (state.total >= 1 && !state.badges.includes("first")) state.badges.push("first");
    if (state.streak >= 3 && !state.badges.includes("streak3")) state.badges.push("streak3");
    if (state.total >= 5 && !state.badges.includes("explorer5")) state.badges.push("explorer5");
    try { storage?.setItem(KEY, JSON.stringify(state)); } catch { /* private mode or full storage: activity remains playable */ }
    return state;
  }

  return Object.freeze({ KEY, ACTIVITY_IDS, EMPTY, localDay, read, dailyChallenge, recommend, record });
});
