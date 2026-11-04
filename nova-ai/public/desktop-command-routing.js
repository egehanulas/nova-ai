(function attachNovaDesktopRouting(root) {
  "use strict";

  function normalize(value) {
    return String(value || "").toLocaleLowerCase("tr-TR")
      .normalize("NFD").replace(/\\p{M}/gu, "")
      .replace(/ı/g, "i").replace(/[^a-z0-9+.:/\\s'-]/g, " ")
      .replace(/\\s+/g, " ").trim();
  }

  function isLikelyDesktopCommand(value) {
    const raw = String(value || "").trim();
    if (!raw || raw.length > 1200) return false;
    const text = normalize(raw);
    if (!text) return false;

    // Clear natural-language questions remain in chat, even if they mention apps.
    if (/^(?:neden|niçin|nasil|nasıl|ne demek|nedir|kimdir|hangi|kaç|kac|ne zaman|sence|bana anlat|açikla|acikla|özetle|ozetle)\\b/u.test(text)) return false;

    const action = /(?:^|\\s)(?:ac|baslat|calistir|oynat|cal|dinlet|tas[iı]|aktar|sil|bul|ara|listele|goster|yaz|tikla|tiklat|hareket ettir|incele|analiz et|kontrol et|raporla|soyle|kaydir|git|gir|yenile|kapat|kopyala|kes|yapistir|kaydet|yazdir|geri al|yinele|kucult|buyut|yakinlastir|uzaklastir|degistir|gecis yap|mesaj at|mesaj gonder|gonder|yolla|sec|secip|indir|yukle|baglan|paylas|doldur|giris yap)(?=$|\\s|[.!?,;])/u;
    const target = /(?:not defteri|notepad|steam|discord|spotify|chrome|google chrome|edge|firefox|paint|hesap makinesi|calculator|dosya gezgini|whatsapp|telegram|windows ayarlari|windows guvenligi|windows security|guvenlik|gorev yoneticisi|masaustu|indirilenler|belgeler|dosya|klasor|islemci|cpu|ram|pil|fare|mouse|ekran|pencere|pdf|jpg|jpeg|png|webp|gif|sekme|sayfa|tarayici|youtube|google|adres cubugu|asagi|yukari|geri|ileri|tam ekran|gecmis|yer imleri|gizli pencere|yeni pencere|uygulama|kaynak kodu|yakınlastirma|video|sohbet|arkadas|mesaj|ekranin|imlec)/u;
    const explicitComputerPhrase = /(?:bilgisayarimda|bilgisayarinda|masaustunde|ekranimda|ekraninda|fare imlecini|mouse imlecini|klavyeden|bilgisayari kontrol et)/u;

    // Explicit local-computer context is enough when paired with an action.
    if (action.test(text) && (target.test(text) || explicitComputerPhrase.test(text))) return true;

    // Browser/app sequences often put the target before the action and contain
    // multiple clauses; recognize common imperative forms without catching questions.
    const appMention = /(?:chrome|google chrome|edge|firefox|youtube|discord|steam|spotify|whatsapp|telegram|not defteri|notepad|hesap makinesi|windows guvenligi|windows security)/u.test(text);
    const sequenceAction = /(?:\\bac\\b|\\bara\\b|\\btikla\\b|\\bgonder\\b|\\byaz\\b|\\boynat\\b|\\bsec\\b|\\byeni sekme\\b)/u.test(text);
    if (appMention && sequenceAction && !/^(?:nedir|ne|neden|nasil|nasıl)\\b/u.test(text)) return true;

    // Commands phrased without naming a specific app, e.g. "ekranın sağ
    // üst köşesine git" or "imleci sağa götür".
    if (explicitComputerPhrase.test(text) && action.test(text)) return true;
    return false;
  }

  root.NovaDesktopRouting = Object.freeze({ isLikelyDesktopCommand });
})(typeof window !== "undefined" ? window : globalThis);
