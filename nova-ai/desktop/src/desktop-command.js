const APP_ALIASES = [
  { names: ["steam"], app: "steam", label: "Steam" },
  { names: ["discord"], app: "discord", label: "Discord" },
  { names: ["paint"], app: "paint", label: "Paint" },
  { names: ["not defteri", "notepad"], app: "notepad", label: "Not Defteri" },
  { names: ["hesap makinesi", "calculator", "calc"], app: "calculator", label: "Hesap Makinesi" },
  { names: ["dosya gezgini", "dosya yöneticisi", "explorer"], app: "explorer", label: "Dosya Gezgini" }
];

function cleanTarget(value) {
  return String(value || "")
    .trim()
    .replace(/^[“”"'\s]+|[“”"'\s]+$/g, "")
    .replace(/^(?:lütfen\s+)?(?:(?:şu|bu)\s+)?/i, "")
    .replace(/(?:['’](?:yi|yı|yu|yü|i|ı|u|ü)|\s+(?:dosyasını|dosyayı|dosyası|klasörünü|klasörü|öğesini|öğeyi))$/i, "")
    .trim();
}

function locationFrom(text) {
  const value = String(text || "").toLocaleLowerCase("tr-TR");
  if (/masaüst/.test(value)) return "Desktop";
  if (/belge/.test(value)) return "Documents";
  if (/indirilen|download/.test(value)) return "Downloads";
  return "";
}

function normalizeDestination(value) {
  const cleaned = cleanTarget(value).replace(/\\s+(?:klasörüne|klasörüne|klasörüne)$/i, "").trim();
  return locationFrom(cleaned) || cleaned;
}

export function parseDesktopCommand(input) {
  const raw = String(input || "").trim();
  if (!raw || raw.length > 500) return { intent: "unknown" };
  const command = raw.replace(/[.!?]+$/g, "").trim();
  const text = command.toLocaleLowerCase("tr-TR")
    .replace(/[!?.,;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/^(?:yardım|komutlar|neler yapabilirsin|ne yapabilirsin)$/.test(text)) return { intent: "help" };
  if (/^(?:bilgisayar bilgileri|sistem bilgileri|bilgisayarımın özellikleri|pc özellikleri)$/.test(text)) return { intent: "computer-info" };
  if (/^(?:klasörler|klasörlerimi göster|dosyalarımı göster|hızlı erişim|masaüstümü göster)$/.test(text)) return { intent: "list-folders" };

  const appText = text
    .replace(/^(?:lütfen\s+)?(?:(?:bana|benim için)\s+)?/i, "")
    .replace(/^(?:uygulamayı\s+)?(?:aç|başlat|çalıştır)\s+/i, "")
    .replace(/\s+(?:uygulamasını\s+)?(?:aç|başlat|çalıştır)(?:\s+(?:lütfen| artık))?$/i, "")
    .replace(/['’](?:i|ı|u|ü)$/i, "")
    .trim();
  const app = APP_ALIASES.find((entry) => entry.names.includes(appText));
  if (app) return { intent: "open-app", app: app.app, label: app.label };

  const createText = raw.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
  const createPatterns = [
    /^(?:lütfen\s+)?(?:yeni\s+)?klasör(?:\s+oluştur|\s+aç)\s+(.+?)(?:\s+(masaüstünde|masaüstüne|masaüstüme|belgelerde|belgelerine|belgelerime|indirilenlerde|indirilenlere|indirilenlerime))?$/,
    /^(?:lütfen\s+)?(masaüstüne|masaüstünde|masaüstüme|belgelere|belgelerde|belgelerime|indirilenlere|indirilenlerde|indirilenlerime)\s+(?:bir\s+)?(.+?)\s+(?:adında\s+)?klasör(?:ü)?(?:\s+oluştur)?$/
  ];
  let match = createText.match(createPatterns[0]);
  let folderName, folderLocation = "Desktop";
  if (match) {
    const start = raw.toLocaleLowerCase("tr-TR").indexOf(match[1]);
    folderName = cleanTarget(raw.slice(start, start + match[1].length));
    folderLocation = locationFrom(match[2]);
  } else {
    match = createText.match(createPatterns[1]);
    if (match) {
      folderLocation = locationFrom(match[1]);
      const start = raw.toLocaleLowerCase("tr-TR").indexOf(match[2]);
      folderName = cleanTarget(raw.slice(start, start + match[2].length));
    }
  }
  if (folderName) return { intent: "create-folder", name: folderName, location: folderLocation };

  match = raw.match(/^(?:taşı|taşır mısın|taşıyabilir misin)\s+(.+?)\s*(?:->|→| içine | klasörüne )\s*(.+)$/i);
  if (match) return { intent: "move-file", source: cleanTarget(match[1]), destination: cleanTarget(match[2]) };

  match = raw.match(/^(?:yeniden adlandır|adını değiştir)\s+(.+?)\s*(?:->|→| olarak | diye )\s*(.+)$/i);
  if (match) return { intent: "rename-file", source: cleanTarget(match[1]), newName: cleanTarget(match[2]) };

  match = text.match(/^(?:sil|çöp kutusuna taşı|geri dönüşüm kutusuna taşı)\s+(.+)$/i)
    || raw.match(/^(.+?)\s+(?:dosyasını|dosyayı|klasörünü|klasörü)?\s*(?:sil|çöp kutusuna taşı|geri dönüşüm kutusuna taşı)$/i);
  if (match) return { intent: "trash-file", target: cleanTarget(match[1]) };

  const searchMatch = raw.match(/^(?:dosya\s+ara|ara|bul|dosyayı\s+bul|dosya\s+bul)\s+(.+)$/i);
  if (searchMatch) return { intent: "search-files", query: cleanTarget(searchMatch[1]) };

  // Natural phrasing: "masaüstündeki 1.jpg dosyasını aç", "1.jpg'yi aç", "şunu aç: 1.jpg".
  const locatedOpenMatch = raw.match(/^(?:lütfen\s+)?(?:masaüstündeki|masaüstünde|belgelerdeki|belgelerde|indirilenlerdeki|indirilenlerde)\s+(.+?)\s+(?:dosyasını|dosyayı|klasörünü|klasörü)?\s*(?:aç|göster|çalıştır)(?:\s+(?:lütfen|artık))?$/i);
  const openMatch = locatedOpenMatch
    || raw.match(/^(?:(?:lütfen)\s+)?(?:(?:bana|benim için)\s+)?(?:şunu\s+)?(?:aç|göster|çalıştır)\s*[:：]?\s*(.+)$/i)
    || raw.match(/^(.+?)\s+(?:dosyasını|dosyayı|klasörünü|klasörü)?\s*(?:aç|göster|çalıştır)(?:\s+(?:lütfen|artık))?$/i);
  if (openMatch) {
    const target = cleanTarget(openMatch[1]);
    if (target) return { intent: "open-path", target };
  }

  // A bare filename request is treated as a search, never as a guessed action.
  match = raw.match(/^(?:masaüstünde|masaüstündeki|belgelerde|belgelerdeki|indirilenlerde|indirilenlerdeki)\s+(.+)$/i);
  if (match) return { intent: "search-files", query: cleanTarget(match[1]), location: locationFrom(raw.slice(0, raw.indexOf(match[1]))) };

  return { intent: "unknown" };
}
