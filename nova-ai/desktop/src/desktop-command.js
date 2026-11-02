const APP_ALIASES = [
  { names: ["steam"], app: "steam", label: "Steam" },
  { names: ["chrome", "google chrome"], app: "chrome", label: "Google Chrome" },
  { names: ["edge", "microsoft edge"], app: "edge", label: "Microsoft Edge" },
  { names: ["firefox"], app: "firefox", label: "Firefox" },
  { names: ["spotify"], app: "spotify", label: "Spotify" },
  { names: ["discord"], app: "discord", label: "Discord" },
  { names: ["paint"], app: "paint", label: "Paint" },
  { names: ["not defteri", "notepad"], app: "notepad", label: "Not Defteri" },
  { names: ["hesap makinesi", "calculator", "calc"], app: "calculator", label: "Hesap Makinesi" },
  { names: ["dosya gezgini", "dosya yöneticisi", "explorer"], app: "explorer", label: "Dosya Gezgini" },
  { names: ["whatsapp"], app: "WhatsApp", label: "WhatsApp", installed: true },
  { names: ["telegram"], app: "Telegram", label: "Telegram", installed: true },
  { names: ["windows ayarları", "ayarlar", "settings"], app: "Windows Settings", label: "Windows Ayarları", installed: true },
  { names: ["görev yöneticisi", "task manager"], app: "Task Manager", label: "Görev Yöneticisi", installed: true }
];

function cleanTarget(value) {
  return String(value || "")
    .trim()
    .replace(/^[“”"'\s]+|[“”"'\s]+$/g, "")
    .replace(/^(?:lütfen\s+)?(?:(?:şu|bu)\s+)?/i, "")
    .replace(/(?:['’](?:yi|yı|yu|yü|i|ı|u|ü)|\s+(?:dosyasını|dosyayı|dosyası|dosya|klasörünü|klasörü|öğesini|öğeyi))$/i, "")
    .trim();
}

const LOCATION_TOKEN = "(?:masaüstü|masaustu|desktop|belgeler|documents|[İiIı]ndirilenler|downloads)(?:\\s+klasör)?(?:ndeki|nde|ne|deki|de|e|ündeki|ünde|üne)?";

function locationFrom(text) {
  const value = String(text || "").toLocaleLowerCase("tr-TR");
  if (/masaüstü|masaustu|desktop/.test(value)) return "Desktop";
  if (/belgeler|documents/.test(value)) return "Documents";
  if (/indirilenler|ındirilenler|download/.test(value)) return "Downloads";
  return "";
}

function normalizeDestination(value) {
  const cleaned = cleanTarget(value).replace(/\s+klasör(?:ü|üne)?$/i, "").trim();
  const prefix = cleaned.match(new RegExp("^(" + LOCATION_TOKEN + ")\\s+(.+)$", "iu"));
  if (prefix) {
    const key = locationFrom(prefix[1]);
    const subfolder = cleanTarget(prefix[2]).replace(/\s+klasör(?:ü|üne)?$/i, "").replace(/['’](?:a|e|ı|i|u|ü)$/i, "").trim();
    return subfolder ? key + "/" + subfolder : key;
  }
  const rootOnly = cleaned.match(new RegExp("^" + LOCATION_TOKEN + "$", "iu"));
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

  let browserMatch = command.match(/^(?:google\s+)?chrome(?:'da|'dan|'de|'den|’da|’dan|da|dan|de|den)\s+(.+?)\s+(?:aç|git|gir)$/iu);
  if (browserMatch) {
    const target = browserMatch[1].trim();
    const url = /^(?:youtube|youtube\.com)$/iu.test(target) ? "https://www.youtube.com"
      : /^https?:\/\//i.test(target) ? target
      : "";
    if (url) return { intent: "open-url", app: "chrome", url };
    return { intent: "open-url", app: "chrome", query: target };
  }

  browserMatch = command.match(/^(?:youtube|youtube\.com)\s+(?:aç|gir)$/iu);
  if (browserMatch) return { intent: "open-url", url: "https://www.youtube.com" };

  browserMatch = command.match(/^youtube(?:'da|’da|da)\s+(.+?)\s+ara$/iu);
  if (browserMatch) return { intent: "open-url", url: "https://www.youtube.com/results?search_query=" + encodeURIComponent(browserMatch[1].trim()) };

  browserMatch = command.match(/^spotify(?:'da|’da|da)\s+(.+?)\s+(?:çal|cal|aç|ac|dinlet)$/iu);
  if (browserMatch) return { intent: "computer-control", done: false, actions: [{ type: "spotify-search", query: browserMatch[1].trim() }, { type: "wait", ms: 1800 }, { type: "inspect-screen" }] };

  browserMatch = command.match(/^steam(?:'de|’de|de)\s+(.+?)\s+(?:aç|ac|başlat|baslat|oyna|çalıştır|calistir)$/iu);
  if (browserMatch) return { intent: "launch-steam-game", game: browserMatch[1].trim() };

  const appText = text
    .replace(/^(?:lütfen\s+)?(?:(?:bana|benim için)\s+)?/i, "")
    .replace(/^(?:uygulamayı\s+)?(?:aç|başlat|çalıştır)\s+/i, "")
    .replace(/\s+(?:uygulamasını\s+)?(?:aç|başlat|çalıştır)(?:\s+(?:lütfen|artık))?$/i, "")
    .replace(/['’](?:i|ı|u|ü)$/i, "")
    .trim();
  const app = APP_ALIASES.find((entry) => entry.names.includes(appText));
  if (app) return app.installed ? { intent: "open-installed-app", app: app.app, label: app.label } : { intent: "open-app", app: app.app, label: app.label };

  const discordRecentConversationTask =
    /discord/i.test(command) &&
    /(?:en\s+son|son)\s+(?:konuştuğum|yazıştığım|mesajlaştığım)/iu.test(command) &&
    /(?:sohbet|kişi|mesaj)/iu.test(command) &&
    /(?:aç|bul|yaz)/iu.test(command);
  if (discordRecentConversationTask) return {
    intent: "computer-control",
    done: false,
    actions: [
      { type: "open-app", app: "discord" },
      { type: "wait", ms: 1400 },
      { type: "inspect-screen" }
    ]
  };

  const genericAppMatch = command.match(/^(?:lütfen\s+)?(.+?)(?:\s+uygulamasını)?\s+(?:aç|başlat|çalıştır)$/iu);
  if (genericAppMatch && !/(?:dosyasını|dosyayı|klasörünü|klasörü|öğesini)/iu.test(genericAppMatch[1])) {
    return { intent: "open-installed-app", app: cleanTarget(genericAppMatch[1]).replace(/[\'’](?:ni|nı|nu|nü|yi|yı|yu|yü|i|ı|u|ü)$/iu, "") };
  }

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

  match = command.match(new RegExp("^(?:lütfen\\s+)?(" + LOCATION_TOKEN + ")\\s+(.+?)\\s+(?:dosyasını|dosyayı|klasörünü|öğesini)\\s+(.+?)\\s+(?:taşı|tası|taşır\\s+mısın|taşıyabilir\\s+misin|aktar|götür|yerleştir|koy)(?:\\s+lütfen)?$", "iu"));
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

  const folderFindAndOpenMatch = command.match(/^(?:lütfen\s+)?(.+?)\s+klasör(?:ünde|unde)\s+(.+?)\s+(?:(?:dosyasını|dosyayı|dosya)\s+)?(?:bul|ara)\s+ve\s+(?:aç|göster|çalıştır)(?:\s+lütfen)?$/iu);
  if (folderFindAndOpenMatch) return {
    intent: "open-path",
    target: cleanTarget(folderFindAndOpenMatch[2]),
    location: cleanTarget(folderFindAndOpenMatch[1])
  };

  const folderOpenMatch = command.match(/^(?:lütfen\s+)?(.+?)\s+klasör(?:ünde|unde)\s+(.+?)\s+(?:(?:dosyasını|dosyayı|dosya)\s+)?(?:aç|göster|çalıştır)(?:\s+(?:lütfen|artık))?$/iu);
  if (folderOpenMatch) return {
    intent: "open-path",
    target: cleanTarget(folderOpenMatch[2]),
    location: cleanTarget(folderOpenMatch[1])
  };

  const folderSearchMatch = command.match(/^(?:lütfen\s+)?(.+?)\s+klasör(?:ündeki|ünde|undaki|unde)\s+(.+?)\s+(?:(?:dosyasını|dosyayı|dosya)\s+)?(?:bul|ara)(?:\s+lütfen)?$/iu);
  if (folderSearchMatch) return {
    intent: "search-files",
    query: cleanTarget(folderSearchMatch[2]),
    location: cleanTarget(folderSearchMatch[1])
  };

  const searchMatch = command.match(/^(?:dosya\s+ara|ara|bul|dosyayı\s+bul|dosya\s+bul)\s+(.+)$/i);
  if (searchMatch) return { intent: "search-files", query: cleanTarget(searchMatch[1]) };

  const driveOpenMatch = command.match(/^([A-Z])\s+(?:sürücüsündeki|diskindeki)\s+(.+?)\s+(?:dosyasını|dosyayı|klasörünü|klasörü)?\s*(?:aç|göster|çalıştır)(?:\s+(?:lütfen|artık))?$/i);
  if (driveOpenMatch) return {
    intent: "open-path",
    target: cleanTarget(driveOpenMatch[2]),
    location: driveOpenMatch[1].toUpperCase() + ":\\"
  };

  const locatedOpenMatch = command.match(new RegExp("^(?:lütfen\\s+)?(" + LOCATION_TOKEN + ")\\s+(.+?)\\s+(?:dosyasını|dosyayı|klasörünü|klasörü)?\\s*(?:aç|göster|çalıştır)(?:\\s+(?:lütfen|artık))?$", "iu"));
  const openMatch = locatedOpenMatch
    || command.match(/^(?:(?:lütfen)\s+)?(?:(?:bana|benim için)\s+)?(?:şunu\s+)?(?:aç|göster|çalıştır)\s*[:：]?\s*(.+)$/i)
    || command.match(/^(.+?)\s+(?:dosyasını|dosyayı|klasörünü|klasörü)?\s*(?:aç|göster|çalıştır)(?:\s+(?:lütfen|artık))?$/i);
  if (openMatch) {
    const target = cleanTarget(locatedOpenMatch ? openMatch[2] : openMatch[1]);
    if (target && !/(?:sohbet|konuştuğum|yazıştığım|kişi|mesaj|discord)/iu.test(target)) return {
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

  match = command.match(new RegExp("^(" + LOCATION_TOKEN + ")\\s+(.+)$", "iu"));
  if (match) return {
    intent: "search-files",
    query: cleanTarget(match[2]),
    location: locationFrom(match[1])
  };

  return { intent: "unknown" };
}
