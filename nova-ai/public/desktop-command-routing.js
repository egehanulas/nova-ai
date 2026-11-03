(function attachNovaDesktopRouting(root) {
  "use strict";

  function isLikelyDesktopCommand(value) {
    const text = String(value || "").toLocaleLowerCase("tr-TR").trim();
    if (!text || text.length > 1200) return false;

    const action = /(?:^|[\s'’])(?:aç|başlat|çalıştır|oynat|taşı|aktar|sil|bul|ara|listele|göster|yaz|tıkla|hareket ettir|incele|kontrol et|raporla|söyle|öğren|kaydır|geç|git|yenile|kapat|kopyala|kes|yapıştır|kaydet|yazdır|geri al|yinele|küçült|büyüt|yakınlaştır|uzaklaştır|değiştir|geçiş yap|sıfırla)(?=$|[\s.!?,;])|(?:açık pencereler|bilgisayar bilgileri|sistem bilgileri|işlemci|cpu|ram kullanımı|pil durumu)/iu;
    const target = /(?:not defteri|notepad|steam|discord|spotify|chrome|google chrome|edge|firefox|paint|hesap makinesi|dosya gezgini|whatsapp|telegram|windows ayarları|görev yöneticisi|masaüstü|indirilenler|belgeler|dosya|klasör|işlemci|cpu|ram|pil|fare|mouse|ekran|pencere|pdf|jpg|jpeg|png|webp|gif|sekme|sayfa|tarayıcı|youtube|google|adres çubuğu|aşağı|yukarı|geri|ileri|tam ekran|geçmiş|indirilenler|yer imleri|gizli pencere|yeni pencere|uygulamalar|kaynak kodu|yakınlaştırma)/iu;

    return action.test(text) && target.test(text);
  }

  root.NovaDesktopRouting = Object.freeze({ isLikelyDesktopCommand });
})(typeof window !== "undefined" ? window : globalThis);
