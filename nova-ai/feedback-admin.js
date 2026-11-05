const FEEDBACK_ADMIN_EMAIL = "egehan1907cl@gmail.com";
const FEEDBACK_STATUSES = new Set(["new", "reviewing", "fixed", "closed"]);

function isFeedbackAdmin(user) {
  const email = String(user?.email || "").trim().toLowerCase();
  const verified = Boolean(user?.email_confirmed_at || user?.confirmed_at);
  return email === FEEDBACK_ADMIN_EMAIL && verified;
}

function normalizeFeedbackStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  return FEEDBACK_STATUSES.has(status) ? status : null;
}

module.exports = { isFeedbackAdmin, normalizeFeedbackStatus };
