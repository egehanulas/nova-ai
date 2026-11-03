const APP_ALIASES = [
  { names: ["steam"], app: "steam", label: "Steam" },
  { names: ["chrome", "google chrome"], app: "chrome", label: "Google Chrome" },
  { names: ["edge", "microsoft edge"], app: "edge", label: "Microsoft Edge" },
  { names: ["firefox"], app: "firefox", label: "Firefox" },
  { names: ["spotify"], app: "spotify", label: "Spotify" },
  { names: ["discord"], app: "discord", label: "Discord" },
  { names: ["paint"], app: "paint", label: "Paint" },
  { names: ["not defteri", "notepad", "windows not defteri", "windows notepad"], app: "notepad", label: "Not Defteri" },
  { names: ["hesap makinesi", "calculator", "calc"], app: "calculator", label: "Hesap Makinesi" },
  { names: ["dosya gezgini", "dosya yöneticisi", "explorer"], app: "explorer", label: "Dosya Gezgini" },
  { names: ["whatsapp"], app: "WhatsApp", label: "WhatsApp", installed: true },
  { names: ["telegram"], app: "Telegram", label: "Telegram", installed: true },
  { names: ["windows ayarları", "windows ayar", "windows ay", "windows settings", "ayarlar", "ayar", "settings"], app: "Settings", label: "Windows Ayarları", installed: true },
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
  const command = raw.replace(/[.!?'"”’»]+$/u, "").trim();
  const text = command.toLocaleLowerCase("tr-TR")
    .replace(/[!?.,;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/^(?:yardım|komutlar|neler yapabilirsin|ne yapabilirsin)$/.test(text)) return { intent: "help" };
  if (/^(?:(?:şu an )?saat kaç(?: ve bugün hangi tarih)?|bugün hangi tarih|tarih ve saat|yerel saat|bilgisayarın saatini söyle|bilgisayarımın saatini söyle)$/iu.test(text)) return { intent: "local-time" };
  if (/^(?:açık pencereleri(?: listele| göster)?|şu anda açık olan pencereleri listele|açık olan uygulama pencerelerini listele|windows.?ta şu anda açık olan uygulama pencerelerinin listesini getir|hangi pencereler açık|açık uygulamaları(?: listele| göster)?|önde hangi pencere var)$/iu.test(text)) return { intent: "list-windows" };
  if (/^(?:ekranımı analiz et|ekranı analiz et|ekrandaki erişilebilir arayüz öğelerini listele|erişilebilir arayüz öğelerini listele|ekranda ne var|ekranımda ne görüyorsun|açık ekranı anlat|ekranı incele)$/iu.test(text)) return { intent: "screen-summary" };
  if (/(?:işlemci|cpu).*(?:ram|bellek)|(?:ram|bellek).*(?:işlemci|cpu)/iu.test(text) && /(?:model|miktar|bilgi|söyle|göster|özellik|ne)/iu.test(text)) return { intent: "computer-info" };
  if (/^(?:bilgisayar bilgileri|sistem bilgileri|bilgisayarımın özellikleri|pc özellikleri|bilgisayarımın pil durumu|bilgisayarımın cpu ram ve pil durumunu göster|bilgisayarımın cpu ram ve pil durumunu|cpu ram ve pil durumunu göster|cpu ram ve pil durumunu|pil durumunu kontrol et|pil durumu|batarya durumu|cpu kullanımı|ram kullanımı|sistem performansı|bilgisayarımın performansı|pil[, ]+cpu ve ram kullanımını(?: kontrol et| raporla)?|cpu ve ram kullanımını(?: kontrol et| raporla)?|işlemci ve ram kullanımını(?: kontrol et| raporla)?|sistem kaynaklarını(?: kontrol et| raporla)?|bilgisayar performansını raporla|işlemcimin modelini söyle|işlemcimin modeli ne|işlemci modelini söyle|işlemci modeli ne|işlemci modeli ve ram miktarını söyle|işlemcimin modeli ve ram miktarı ne|işlemci ve ram miktarını söyle|işlemci modelini ve ram miktarını göster|cpu modelini söyle|cpu modeli ne|hangi işlemciyi kullanıyorum|hangi işlemci var bilgisayarımda|bilgisayarımın işlemcisini söyle)$/iu.test(text)) return { intent: "computer-info" };
  if (/^(?:(?:masaüstündeki|bilgisayardaki|erişilebilir sürücülerdeki)\s+)?dosyalar(?:ı|ımı|imi)?\s+incele(?:\s+ve\s+.*)?$/iu.test(command)) return { intent: "list-folders" };
  const extensionSearchMatch = text.match(/^(?:(masaüstümdeki|masaüstündeki|desktop(?:\s+klasöründeki)?)|(belgelerimdeki|belgelerimde|belgelerdeki)|(indirilenlerimdeki|indirilenlerimde|indirilenlerdeki)|(bilgisayarımdaki|bilgisayardaki|tüm sürücülerdeki|erişilebilir sürücülerdeki))\s+(?:(?:tüm|bütün)\s+)?([a-z0-9]{1,8})\s+dosyalarını?\s+(?:bul|ara|listele)(?:\s+ve\s+isimlerini\s+listele)?$/iu);
  if (extensionSearchMatch) {
    const location = extensionSearchMatch[1] ? "Desktop"
      : extensionSearchMatch[2] ? "Documents"
      : extensionSearchMatch[3] ? "Downloads" : "";
    const extension = extensionSearchMatch[5].toLocaleLowerCase("tr-TR").replace(/^\./, "");
    return { intent: "search-files", query: "." + extension, ...(location ? { location } : {}) };
  }
  if (/^masaüstümdeki dosyaları listele ve varsa pdf dosyalarını bul$/iu.test(command)) return { intent: "search-files", query: ".pdf", location: "Desktop" };

  let browserMatch = command.match(/^(?:google\s+)?chrome(?:'da|'dan|'de|'den|’da|’dan|da|dan|de|den)\s+(.+?)\s+(?:aç|git|gir)$/iu);
  if (browserMatch) {
    const target = browserMatch[1].trim();
    const url = /^(?:youtube|youtube\.com)$/iu.test(target) ? "https://www.youtube.com"
      : /^https?:\/\//i.test(target) ? target
      : "";
    if (url) return { intent: "open-url", app: "chrome", url };
    return { intent: "open-url", app: "chrome", query: target };
  }

  browserMatch = command.match(/^(?:(?:youtube|youtube\.com)(?:['’](?:u|yu))?|yt(?:['’](?:yi|yı))?)\s+(?:aç|gir)$/iu);
  if (browserMatch) return { intent: "open-url", url: "https://www.youtube.com" };

  browserMatch = command.match(/^(?:youtube|youtube\.com|yt)(?:\s*['’]?(?:da|de))?\s+(.+?)\s+(?:(video(?:su|sunu)?)\s+)?(ara|aç|ac|çal|cal|oynat)$/iu);
  if (browserMatch) {
    const query = browserMatch[1].trim() + (browserMatch[2] ? " video" : "");
    const url = "https://www.youtube.com/results?search_query=" + encodeURIComponent(query);
    if (browserMatch[2] && /^(?:aç|ac|oynat)$/iu.test(browserMatch[3])) return {
      intent: "computer-control", done: false,
      actions: [{ type: "open-url", url }, { type: "wait", ms: 1600 }, { type: "inspect-screen" }]
    };
    return { intent: "open-url", url };
  }

  const explicitResearchRequest =
    /(?:google(?:['’]da|da|de)?|internette|web(?:['’]de|de)|hava durumu|güncel bilgi)/iu.test(command) &&
    /(?:araştır|arastir|\bara\b|özetle|ozetle|incele)/iu.test(command);
  if (explicitResearchRequest) {
    let query = command.replace(/^(?:lütfen\s+)?(?:google(?:['’]da|da|de)?|internette|web(?:['’]de|de))\s+/iu, "");
    query = query.replace(/\s+(?:ara|araştır|arastir|özetle|ozetle|incele)\b[\s\S]*$/iu, "").trim();
    if (!query) query = command;
    return { intent: "computer-control", done: false, actions: [{ type: "research-web", query: query.slice(0, 1200) }] };
  }

  browserMatch = command.match(/^spotify(?:'da|’da|da)\s+(.+?)\s+(?:çal|cal|aç|ac|dinlet)$/iu);
  if (browserMatch) return { intent: "computer-control", done: false, actions: [{ type: "spotify-search", query: browserMatch[1].trim() }, { type: "wait", ms: 1800 }, { type: "inspect-screen" }] };

  browserMatch = command.match(/^steam(?:'de|’de|de)\s+(.+?)\s+(?:aç|ac|başlat|baslat|oyna|çalıştır|calistir)$/iu);
  if (browserMatch) return { intent: "launch-steam-game", game: browserMatch[1].trim() };

  const normalizeAppName = (value) => String(value || "").trim()
    .replace(/[’']/g, "'")
    .replace(/'(?:nı|ni|nu|nü|yı|yi|yu|yü|ı|i|u|ü)$/iu, "")
    .replace(/\s+uygulamasını$/iu, "")
    .toLocaleLowerCase("tr-TR")
    .trim();
  const appSequenceMatch = command.match(/^(?:(?:lütfen|önce)\s+)?(.+?)\s+aç\s*[,;]?\s*(?:ardından|sonra|daha sonra)\s+(.+?)\s+aç(?:\s*[,;]?\s*(?:ardından|sonra|daha sonra)\s+(.+?)\s+aç)?$/iu);
  if (appSequenceMatch) {
    const requestedApps = [appSequenceMatch[1], appSequenceMatch[2], appSequenceMatch[3]].filter(Boolean);
    const selectedApps = requestedApps.map((name) =>
      APP_ALIASES.find((entry) => entry.names.includes(normalizeAppName(name)))
    );
    if (selectedApps.every(Boolean)) {
      const actions = [];
      selectedApps.forEach((entry, index) => {
        actions.push({ type: entry.installed ? "open-installed-app" : "open-app", app: entry.app });
        if (index < selectedApps.length - 1) actions.push({ type: "wait", ms: 900 });
      });
      actions.push({ type: "finish" });
      return {
        intent: "computer-control",
        done: true,
        message: (selectedApps.length === 2 ? selectedApps.map((entry) => entry.label).join(" ve ") : selectedApps.map((entry) => entry.label).join(", ")) + " açıldı.",
        actions
      };
    }
  }

  const notepadWriteMatch = command.match(/^(?:(?:windows\s+)?not defteri|notepad)(?:['’](?:ni|nı|nu|nü))?(?:\s+uygulamasını)?\s+aç\s+ve\s+(?:içine|içerisine)\s+["“]?([\s\S]+?)["”]?\s+yaz$/iu);
  if (notepadWriteMatch) {
    const value = notepadWriteMatch[1].trim().replace(/^[“"]|[”"]$/g, "");
    if (value && value.length <= 4000) return {
      intent: "computer-control", done: true, message: "Not Defteri açıldı ve metin yazıldı.",
      actions: [
        { type: "open-app", app: "notepad" },
        { type: "wait", ms: 900 },
        { type: "type-text", text: value, processName: "notepad" },
        { type: "finish" }
      ]
    };
  }



  const mouseCornerMatch = command.match(/^(?:mouse|fare)\s+(?:imlecini\s+)?(?:yavaşça\s+)?ekranın\s+(sol üst|sağ üst|sol alt|sağ alt|ortasına)\s+(?:köşesine\s+)?(?:yavaşça\s+)?(?:hareket ettir|götür|taşı)$/iu);
  if (mouseCornerMatch) {
    const corner = { "sol üst": "top-left", "sağ üst": "top-right", "sol alt": "bottom-left", "sağ alt": "bottom-right", "ortasına": "center" }[mouseCornerMatch[1].toLocaleLowerCase("tr-TR")];
    return { intent: "computer-control", done: true, message: "Fare imleci istenen konuma yumuşak biçimde taşındı.", actions: [{ type: "move-mouse", corner, durationMs: 900, steps: 40 }, { type: "finish" }] };
  }

  const mouseDirection = command.match(/^(?:mouse|fare)(?:['’](?:u|ı|i)|yı|yi|yu|yü|u|ı|i|ü)?\s+(sağa|sola|yukarı|aşağı)\s+(?:hareket ettir|oynat|götür)$/iu);
  if (mouseDirection) {
    const direction = mouseDirection[1].toLocaleLowerCase("tr-TR");
    const delta = direction === "sağa" ? { dx: 140, dy: 0 } : direction === "sola" ? { dx: -140, dy: 0 } : direction === "yukarı" ? { dx: 0, dy: -140 } : { dx: 0, dy: 140 };
    return { intent: "computer-control", done: true, message: "Mouse yumuşak biçimde hareket ettirildi.", actions: [{ type: "move-mouse", ...delta, durationMs: 650, steps: 32 }, { type: "finish" }] };
  }

  const appText = text
    .replace(/^(?:lütfen\s+)?(?:(?:bana|benim için)\s+)?/i, "")
    .replace(/^(?:uygulamayı\s+)?(?:aç|başlat|çalıştır)\s+/i, "")
    .replace(/\s+(?:uygulamasını\s+)?(?:aç|başlat|çalıştır)(?:\s+(?:lütfen|artık))?$/i, "")
    .replace(/(?:['’](?:nı|ni|nu|nü|yı|yi|yu|yü|ı|i|u|ü)|(?:larını|lerini|ları|leri|sini|sını|nı|ni|nu|nü|yı|yi|yu|yü))$/iu, "")
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
  if (genericAppMatch && !/(?:dosyasını|dosyayı|dosya|klasörünü|klasörü|klasör|öğesini)|\.[a-z0-9]{2,6}(?:['’](?:yi|yı|yu|yü|i|ı|u|ü))?$/iu.test(genericAppMatch[1])) {
    return { intent: "open-installed-app", app: cleanTarget(genericAppMatch[1]).replace(/['’](?:ni|nı|nu|nü|yi|yı|yu|yü|i|ı|u|ü)$/iu, "") };
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
