const FEEDBACK_TYPES = new Set(["bug", "feature", "performance", "general"]);

function redactDiagnosticText(value) {
  return String(value || "")
    .slice(0, 6000)
    .replace(/Bearer\\s+[A-Za-z0-9._~+\\/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password|authorization)\\s*[:=]\\s*)[^\\s,;]+/gi, "$1[REDACTED]")
    .replace(/\\bsk-[A-Za-z0-9_-]{12,}\\b/g, "[REDACTED_KEY]")
    .replace(/\\b[\\w.+-]+@[\\w.-]+\\.[A-Z]{2,}\\b/gi, "[EMAIL_REDACTED]")
    .replace(/([A-Za-z]:\\\\Users\\\\)[^\\\\\\s]+/gi, "$1[USER]")
    .slice(0, 3000);
}

function normalizeFeedbackPayload(body = {}) {
  const type = String(body.feedbackType || "").trim();
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const includeDiagnostics = body.includeDiagnostics === true;

  if (!FEEDBACK_TYPES.has(type)) {
    return { ok: false, error: "Geçerli bir bildirim türü seç." };
  }
  if (description.length < 10 || description.length > 4000) {
    return { ok: false, error: "Açıklama 10–4000 karakter arasında olmalı." };
  }

  const raw = body.diagnostics && typeof body.diagnostics === "object" && !Array.isArray(body.diagnostics)
    ? body.diagnostics
    : {};
  const diagnostics = includeDiagnostics ? {
    appVersion: String(raw.appVersion || "").slice(0, 40),
    platform: String(raw.platform || "").slice(0, 80),
    userAgent: String(raw.userAgent || "").slice(0, 300),
    logs: redactDiagnosticText(raw.logs || "")
  } : {};

  return {
    ok: true,
    value: { feedbackType: type, description, includeDiagnostics, diagnostics }
  };
}

function buildFeedbackTicketCode(id) {
  const compact = String(id || "").replace(/[^a-z0-9]/gi, "").toUpperCase();
  if (compact.length < 10) throw new Error("Geçersiz bildirim kimliği.");
  return "NOVA-" + compact.slice(0, 10);
}

function buildFeedbackEmailText(report) {
  const typeLabels = {
    bug: "Hata bildirimi",
    feature: "Özellik isteği",
    performance: "Performans sorunu",
    general: "Genel geri bildirim"
  };
  const lines = [
    "NOVA AI geri bildirim bildirimi",
    "Bildirim: " + report.ticketCode,
    "Tür: " + (typeLabels[report.feedbackType] || report.feedbackType),
    "Tarih: " + (report.createdAt || new Date().toISOString()),
    "",
    "Açıklama:",
    report.description
  ];
  if (report.includeDiagnostics) {
    lines.push("", "Kullanıcının açıkça seçtiği teknik bilgiler:");
    lines.push("Uygulama sürümü: " + (report.diagnostics?.appVersion || "Bilinmiyor"));
    lines.push("Platform: " + (report.diagnostics?.platform || "Bilinmiyor"));
    lines.push("User-Agent: " + (report.diagnostics?.userAgent || "Bilinmiyor"));
    if (report.diagnostics?.logs) lines.push("", "Teknik log:", report.diagnostics.logs);
  }
  return lines.join("\\n");
}

module.exports = {
  buildFeedbackEmailText,
  buildFeedbackTicketCode,
  normalizeFeedbackPayload,
  redactDiagnosticText
};
