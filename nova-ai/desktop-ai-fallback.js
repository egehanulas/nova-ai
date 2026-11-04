"use strict";

function buildScreenTextFallbackPrompt({ activeWindow = "", visibleItems = [] } = {}) {
  const items = Array.isArray(visibleItems) ? visibleItems.slice(0, 35).map((item) => ({
    name: String(item?.name || "").slice(0, 100),
    controlType: String(item?.controlType || "").slice(0, 24)
  })) : [];

  return [
    "Görsel ekran modeli şu anda kullanılamıyor; Google Gemini görsel analiz kotası/ön ödemesi tükenmiş olabilir.",
    "Ekran görüntüsünü görmüş gibi davranma ve görünmeyen ayrıntılar uydurma.",
    "Yalnızca aşağıdaki etkin pencere adı ve erişilebilir arayüz öğelerine dayanarak Türkçe, sınırlı bir açıklama yap.",
    "Görüntüdeki renkleri, resimleri, grafiklerini veya okunamayan metinleri tarif etme.",
    "Etkin pencere: " + (String(activeWindow || "").slice(0, 160) || "bilinmiyor"),
    "Erişilebilir arayüz öğeleri: " + JSON.stringify(items),
    "Erişilebilir bilgiler yetersizse bunu açıkça belirt."
  ].join("\n");
}

function buildTextOnlyDesktopFallbackInstruction(instruction) {
  return String(instruction || "") +
    "\n\nGÖRSEL MODEL YEDEK KURALI: Görsel model kullanılamadığı için ekran görüntüsünü analiz edemiyorsun. " +
    "Yalnızca verilen etkin pencere ve erişilebilir UI öğelerine dayan. Görmediğin düğme, metin veya konumu tahmin etme. " +
    "Bir sonraki eylem için yeterli kanıt yoksa güvenli biçimde dur ve kullanıcıdan bilgi iste.";
}

module.exports = { buildScreenTextFallbackPrompt, buildTextOnlyDesktopFallbackInstruction };
