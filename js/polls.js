(function () {
  const node = typeof module !== "undefined" && module.exports;
  const rules = node ? require("./rules.js") : window.ExicanRules;

  function selectPoll(polls, preferredId, nowIso = new Date().toISOString()) {
    return polls.find((poll) => poll.id === preferredId) ||
      polls.find((poll) => rules.pollStatus(poll, nowIso) === "open") || polls[0] || null;
  }

  function pollForDate(polls, matchDate) {
    return matchDate ? polls.find((poll) => poll.match_date === matchDate) || null : null;
  }

  const api = { selectPoll, pollForDate };
  if (typeof window !== "undefined") window.ExicanPolls = api;
  if (node) module.exports = api;
})();
