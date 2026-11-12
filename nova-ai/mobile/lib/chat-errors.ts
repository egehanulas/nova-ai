const messages: Record<string, string> = {
  AI_RATE_LIMIT: 'Yapay zekâ hizmeti şu anda yoğun. Mesajın kaydedildi; biraz sonra yeniden deneyebilirsin.',
  AI_TIMEOUT: 'Yanıt hazırlama süresi doldu. Mesajın kaydedildi; yeniden deneyebilirsin.',
  AI_INCOMPLETE: 'Yanıt akışı tamamlanmadan kesildi. Eksik yanıt kaydedilmedi; mesajın duruyor, yeniden deneyebilirsin.',
  AI_OUTPUT_LIMIT: 'Yanıt uzunluk sınırına ulaştığı için tamamlanamadı. Eksik yanıt kaydedilmedi; konuyu bölerek yeniden sorabilirsin.',
  AI_CONFIGURATION: 'Yanıt hizmeti şu anda hazır değil. Biraz sonra yeniden deneyebilirsin.',
  AI_AUTH: 'Oturumunun süresi dolmuş. Sohbet mesajın kaydedildi; yanıtı yeniden denemeden önce tekrar giriş yap.',
  AI_EMPTY: 'Bu kez tamamlanmış bir yanıt oluşturulamadı. Mesajın kaydedildi; yeniden deneyebilirsin.',
  NETWORK: 'İnternet bağlantısı kurulamadı. Bağlantını kontrol et; kaydedilen mesajını yeniden deneyebilirsin.',
  AI_UNAVAILABLE: 'Şu anda yanıtımı hazırlarken bir sorun oluştu. Mesajın kaydedildi. Daha sonra yeniden deneyebilirsin.',
};

export function friendlyChatError(error: unknown, userTurnSaved: boolean): string {
  if (!userTurnSaved) return 'Mesajın sohbete kaydedilemedi. Metni gönderim alanına geri aldım; bağlantını kontrol edip yeniden dene.';
  if (error && typeof error === 'object') {
    const value = error as { code?: unknown; status?: unknown; name?: unknown; message?: unknown };
    if (typeof value.code === 'string' && messages[value.code]) return messages[value.code];
    if (value.status === 401 || value.status === 403) return messages.AI_AUTH;
    if (value.status === 429) return messages.AI_RATE_LIMIT;
    if (value.status === 504 || value.name === 'TimeoutError') return messages.AI_TIMEOUT;
    if (value.name === 'TypeError' && /fetch|network/i.test(String(value.message))) return 'İnternet bağlantısı kurulamadı. Bağlantını kontrol et; kaydedilen mesajını yeniden deneyebilirsin.';
  }
  return messages.AI_UNAVAILABLE;
}
