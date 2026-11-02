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
    .replace(/(?:['’](?:yi|yı|yu|yü|i|ı|u|ü)|\s+(?:dosyasını|dosyayı|dosyası|dosya|klasörünü|klasörü|öğesini|öğeyi))$/i, "")
    .trim();
}

const LOCATION_TOKEN = "(?:masaüstü|masaustu|desktop|belgeler|documents|indirilenler|downloads)(?:\\s+klasör)?(?:ndeki|nde|ne|deki|de|e|ündeki|ünde|üne)?";

function locationFrom(text) {
  const value = String(text || "").toLocaleLowerCase("tr-TR");
  if (/masaüstü|masaustu|desktop/.test(value)) return "Desktop";
  if (/belgeler|documents/.test(value)) return "Documents";
  if (/indirilenler|download/.test(value)) return "Downloads";
  return "";
}

function normalizeDestination(value) {
  const cleaned = cleanTarget(value).replace(/\\s+klasör(?:ü|üne)?$/i, "").trim();
  const prefix = cleaned.match(new RegExp("^(" + LOCATION_TOKEN + ")\\s+(.+)$", "i"));
  if (prefix) {
    const key = locationFrom(prefix[1]);
    const subfolder = cleanTarget(prefix[2]).replace(/\\s+klasör(?:ü|üne)?$/i, "").trim();
    return subfolder ? key + "/" + subfolder : key;
  }
  const rootOnly = cleaned.match(new RegExp("^" + LOCATION_TOKEN + "$", "i"));
  return rootOnly ? locationFrom(cleaned) : cleaned;
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
  if (/^(?:klasörler|klasörlerimi göster|dosyalarımı göster|hızlı erişim|sürücüleri göster|diskleri göster)$/.test(text)) return { intent: "list-folders" };

  const appText = text
    .replace(/^(?:lütfen\s+)?(?:(?:bana|benim için)\s+)?/i, "")
    .replace(/^(?:uygulamayı\s+)?(?:aç|başlat|çalıştır)\s+/i, "")
    .replace(/\s+(?:uygulamasını\s+)?(?:aç|başlat|çalıştır)(?:\s+(?:lütfen|artık))?$/i, "")
    .replace(/['’](?:i|ı|u|ü)$/i, "")
    .trim();
  const app = APP_ALIASES.find((entry) => entry.names.includes(appText));
  if (app) return { intent: "open-app", app: app.app, label: app.label };

  const createText = command.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
  const createPatterns = [
    /^(?:lütfen\s+)?(?:yeni\s+)?klasör(?:\s+oluştur|\s+aç)\s+(.+?)(?:\s+(masaüstünde|masaüstüne|masaüstüme|belgelerde|belgelerine|belgelerime|indirilenlerde|indirilenlere|indirilenlerime))?$/,
    /^(?:lütfen\s+)?(masaüstüne|masaüstünde|masaüstüme|belgelere|belgelerde|belgelerime|indirilenlere|indirilenlerde|indirilenlerime)\s+(?:bir\s+)?(.+?)\s+(?:adında\s+)?klasör(?:ü)?(?:\s+oluştur)?$/
  ];
  let match = createText.match(createPatterns[0]);
  let folderName, folderLocation = "Desktop";
  if (match) {
    const start = command.toLocaleLowerCase("tr-TR").indexOf(match[1]);
    folderName = cleanTarget(command.slice(start, start + match[1].length));
    folderLocation = locationFrom(match[2]) || "Desktop";
  } else {
    match = createText.match(createPatterns[1]);
    if (match) {
      folderLocation = locationFrom(match[1]) || "Desktop";
      const start = command.toLocaleLowerCase("tr-TR").indexOf(match[2]);
      folderName = cleanTarget(command.slice(start, start + match[2].length));
    }
  }
  if (folderName) return { intent: "create-folder", name: folderName, location: folderLocation };

  match = command.match(new RegExp("^(?:lütfen\\s+)?(" + LOCATION_TOKEN + ")\\s+(.+?)\\s+(?:dosyasını|dosyayı|klasörünü|öğesini)\\s+(.+?)\\s+(?:taşı|tası|taşır\\s+mısın|taşıyabilir\\s+misin|aktar|götür|yerleştir|koy)(?:\\s+lütfen)?$", "i"));
  if (match) return {
    intent: "move-file",
    source: cleanTarget(match[2]),
    sourceLocation: locationFrom(match[1]),
    destination: normalizeDestination(match[3])
  };

  match = command.match(/^([A-Z])\s+(?:sürücüsündeki|diskindeki)\s+(.+?)\s+(?:dosyasını|dosyayı|klasörünü|öğesini)\s+(.+?)\s+(?:taşı|tası|taşır\s+mısın|taşıyabilir\s+misin|aktar|götür|yerleştir|koy)(?:\s+lütfen)?$/i);
  if (match) return {
    intent: "move-file",
    source: cleanTarget(match[2]),
    sourceLocation: match[1].toUpperCase() + ":\\",
    destination: normalizeDestination(match[3])
  };

  match = command.match(/^(.+?)\s+(?:dosyasını|dosyayı|klasörünü|öğesini)\s+(.+?)\s+(?:taşı|tası|taşır\s+mısın|taşıyabilir\s+misin|aktar|götür|yerleştir|koy)(?:\s+lütfen)?$/i);
  if (match) return {
    intent: "move-file",
    source: cleanTarget(match[1]),
    destination: normalizeDestination(match[2])
  };

  match = command.match(/^(?:taşı|tası|taşır mısın|taşıyabilir misin|aktar|götür|yerleştir|koy)\s+(.+?)\s*(?:->|→| içine | klasörüne )\s*(.+)$/i);
  if (match) return { intent: "move-file", source: cleanTarget(match[1]), destination: normalizeDestination(match[2]) };

  match = command.match(/^(?:yeniden adlandır|adını değiştir)\s+(.+?)\s*(?:->|→| olarak | diye )\s*(.+)$/i);
  if (match) return { intent: "rename-file", source: cleanTarget(match[1]), newName: cleanTarget(match[2]) };

  match = text.match(/^(?:sil|çöp kutusuna taşı|geri dönüşüm kutusuna taşı)\s+(.+)$/i)
    || command.match(/^(.+?)\s+(?:dosyasını|dosyayı|klasörünü|klasörü)?\s*(?:sil|çöp kutusuna taşı|geri dönüşüm kutusuna taşı)$/i);
  if (match) return { intent: "trash-file", target: cleanTarget(match[1]) };

  const searchMatch = command.match(/^(?:dosya\s+ara|ara|bul|dosyayı\s+bul|dosya\s+bul)\s+(.+)$/i);
  if (searchMatch) return { intent: "search-files", query: cleanTarget(searchMatch[1]) };

  const driveOpenMatch = command.match(/^([A-Z])\s+(?:sürücüsündeki|diskindeki)\s+(.+?)\s+(?:dosyasını|dosyayı|klasörünü|klasörü)?\s*(?:aç|göster|çalıştır)(?:\s+(?:lütfen|artık))?$/i);
  if (driveOpenMatch) return {
    intent: "open-path",
    target: cleanTarget(driveOpenMatch[2]),
    location: driveOpenMatch[1].toUpperCase() + ":\\"
  };

  const locatedOpenMatch = command.match(new RegExp("^(?:lütfen\\s+)?(" + LOCATION_TOKEN + ")\\s+(.+?)\\s+(?:dosyasını|dosyayı|klasörünü|klasörü)?\\s*(?:aç|göster|çalıştır)(?:\\s+(?:lütfen|artık))?$", "i"));
  const openMatch = locatedOpenMatch
    || command.match(/^(?:(?:lütfen)\s+)?(?:(?:bana|benim için)\s+)?(?:şunu\s+)?(?:aç|göster|çalıştır)\s*[:：]?\s*(.+)$/i)
    || command.match(/^(.+?)\s+(?:dosyasını|dosyayı|klasörünü|klasörü)?\s*(?:aç|göster|çalıştır)(?:\s+(?:lütfen|artık))?$/i);
  if (openMatch) {
    const target = cleanTarget(locatedOpenMatch ? openMatch[2] : openMatch[1]);
    if (target) return {
      intent: "open-path",
      target,
      ...(locatedOpenMatch && locationFrom(locatedOpenMatch[1]) ? { location: locationFrom(locatedOpenMatch[1]) } : {})
    };
  }

  match = command.match(/^([A-Z])\s+(?:sürücüsünde|diskinde)\s+(.+)$/i);
  if (match) return {
    intent: "search-files",
    query: cleanTarget(match[2]),
    location: match[1].toUpperCase() + ":\\"
  };

  match = command.match(new RegExp("^(" + LOCATION_TOKEN + ")\\s+(.+)$", "i"));
  if (match) return {
    intent: "search-files",
    query: cleanTarget(match[2]),
    location: locationFrom(match[1])
  };

  return { intent: "unknown" };
}
