"use strict";

const MESSAGES = Object.freeze({
  AI_RATE_LIMIT: "Yapay zekâ hizmeti şu anda yoğun. Mesajın kaydedildi; biraz sonra yeniden deneyebilirsin.",
  AI_TIMEOUT: "Yanıt hazırlama süresi doldu. Mesajın kaydedildi; yeniden deneyebilirsin.",
  AI_INCOMPLETE: "Yanıt akışı tamamlanmadan kesildi. Eksik yanıt kaydedilmedi; mesajın duruyor, yeniden deneyebilirsin.",
  AI_OUTPUT_LIMIT: "Yanıt uzunluk sınırına ulaştığı için tamamlanamadı. Eksik yanıt kaydedilmedi; konuyu bölerek yeniden sorabilirsin.",
  AI_CONFIGURATION: "Yanıt hizmeti şu anda hazır değil. Biraz sonra yeniden deneyebilirsin.",
  AI_AUTH: "Oturumunun süresi dolmuş. Sohbet mesajın kaydedildi; yanıtı yeniden denemeden önce tekrar giriş yap.",
  AI_UNAVAILABLE: "Şu anda yanıtımı hazırlarken bir sorun oluştu. Mesajın kaydedildi. Daha sonra yeniden deneyebilirsin.",
  NETWORK: "İnternet bağlantısı kurulamadı. Bağlantını kontrol et; kaydedilen mesajını yeniden deneyebilirsin.",
  AI_EMPTY: "Bu kez tamamlanmış bir yanıt oluşturulamadı. Mesajın kaydedildi; yeniden deneyebilirsin.",
});

function classifyAiError(error) {
  const code = String(error?.code || "").toUpperCase();
  if (Object.hasOwn(MESSAGES, code)) return code;
  const status = Number(error?.status);
  if (status === 401 || status === 403) return "AI_AUTH";
  const message = String(error?.message || "").toLowerCase();
  if (status === 429 || /rate limit|too many requests|tpm limit/.test(message)) return "AI_RATE_LIMIT";
  if (status === 504 || error?.name === "AbortError" || error?.name === "TimeoutError" || /timed? ?out|timeout|süresi doldu/.test(message)) return "AI_TIMEOUT";
  if (error?.network === true || error?.name === "TypeError" && /fetch|network/i.test(message)) return "NETWORK";
  if (/token sınırında|maximum context length|finish_reason.*length/.test(message)) return "AI_OUTPUT_LIMIT";
  if (/boş yanıt|empty response|no content/.test(message)) return "AI_EMPTY";
  return "AI_UNAVAILABLE";
}

function getAiErrorMessage(error) {
  return MESSAGES[classifyAiError(error)] || MESSAGES.AI_UNAVAILABLE;
}

function createProviderExhaustedError(failures, configuredProviderCount) {
  const error = new Error("All configured AI providers failed.");
  error.failures = failures;
  if (!configuredProviderCount) error.code = "AI_CONFIGURATION";
  else if (failures.length && failures.every((item) => classifyAiError(item) === "AI_RATE_LIMIT")) error.code = "AI_RATE_LIMIT";
  else if (failures.length && failures.every((item) => classifyAiError(item) === "AI_OUTPUT_LIMIT")) error.code = "AI_OUTPUT_LIMIT";
  else if (failures.length && failures.every((item) => classifyAiError(item) === "AI_INCOMPLETE")) error.code = "AI_INCOMPLETE";
  else if (failures.length && failures.every((item) => classifyAiError(item) === "NETWORK")) error.code = "NETWORK";
  else if (failures.length && failures.every((item) => classifyAiError(item) === "AI_TIMEOUT")) error.code = "AI_TIMEOUT";
  else error.code = "AI_UNAVAILABLE";
  return error;
}

function safeProviderDiagnostic(provider, error) {
  const diagnostic = { provider: String(provider || "unknown").slice(0, 32), code: classifyAiError(error) };
  if (Number.isInteger(Number(error?.status))) diagnostic.status = Number(error.status);
  if (error?.name && /^[A-Za-z]{1,32}$/.test(error.name)) diagnostic.name = error.name;
  if (Number.isFinite(Number(error?.retryAfterMs))) diagnostic.retryAfterMs = Math.max(0, Math.min(300000, Number(error.retryAfterMs)));
  return diagnostic;
}

module.exports = { MESSAGES, classifyAiError, getAiErrorMessage, createProviderExhaustedError, safeProviderDiagnostic };
