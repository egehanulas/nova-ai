(() => {
  "use strict";
  const stage = document.getElementById("companionStage");
  const label = document.getElementById("companionStateLabel");
  const detail = document.getElementById("companionStateDetail");
  if (!stage || !label || !detail) return;
  const states = {
    idle: ["Buradayım", "Hazır olduğunda birlikte başlayabiliriz."],
    listening: ["Seni dinliyorum", "Söz sende."],
    thinking: ["Biraz düşüneyim", "İsteğini dikkatle hazırlıyorum."],
    speaking: ["Yanıtlıyorum", "EYRION sesli olarak konuşuyor."],
    working: ["İş başında", "İstenen görev gerçekten yürütülüyor."],
    exploring: ["Birlikte keşfediyoruz", "Seçtiğin etkinlik açık."],
    success: ["Tamamlandı", "İşlem başarıyla sonuçlandı."],
    error: ["Yardım gerekebilir", "İşlem tamamlanamadı. Sohbette ayrıntıyı görebilirsin."]
  };
  let resetTimer;
  function setState(next, message = "") {
    const state = Object.hasOwn(states, next) ? next : "idle";
    stage.dataset.state = state;
    label.textContent = states[state][0];
    detail.textContent = message || states[state][1];
    window.clearTimeout(resetTimer);
    if (["success", "error"].includes(state)) resetTimer = window.setTimeout(() => setState("idle"), 6500);
  }
  window.addEventListener("nova:companion-state", (event) => setState(event.detail?.state, event.detail?.message));

  const panel = document.getElementById("activityPanel");
  const streakView = document.getElementById("discoveryStreak");
  const totalView = document.getElementById("discoveryTotal");
  const badgesView = document.getElementById("discoveryBadges");
  const recommendationView = document.getElementById("discoveryRecommendation");
  const historyView = document.getElementById("discoveryHistory");
  const activityNames = { riddle: "Bilmece", quiz: "Bilgi turu", memory: "Hafıza", word: "Kelime zinciri", story: "Hikâye", guess: "Sayı tahmini", daily: "Günün keşfi" };
  let recordAs = "";
  function progressStorage() { try { return window.localStorage; } catch { return null; } }
  function refreshProgress() {
    const state = window.EyrionDiscoveryState?.read(progressStorage());
    if (!state) return;
    if (streakView) streakView.textContent = `${state.streak} günlük seri`;
    if (totalView) totalView.textContent = String(state.total);
    if (badgesView) badgesView.textContent = `${state.badges.length} rozet`;
    if (historyView) historyView.textContent = state.history.length ? `Son: ${activityNames[state.history[0].id] || "Keşif"}` : "İlk etkinliğin seni bekliyor.";
    const next = window.EyrionDiscoveryState.recommend(state);
    if (recommendationView) recommendationView.textContent = next ? `Öneri: ${activityNames[next]}` : "Bir keşif seç.";
  }
  function completeActivity(message) {
    if (recordAs) window.EyrionDiscoveryState?.record(progressStorage(), recordAs);
    recordAs = "";
    refreshProgress();
    feedback(message, true);
  }
  refreshProgress();
  const riddles = [
    { q: "Ne kadar çok alırsan, o kadar çok geride bırakırsın. Nedir?", a: ["adım", "ayak izi"], h: "Yürürken oluşur." },
    { q: "Dili yok konuşur, kanadı yok uçar. Nedir?", a: ["mektup", "haber"], h: "Birinden diğerine ulaşır." },
    { q: "Her şeyi gösterir ama kendini gösteremez. Nedir?", a: ["ayna"], h: "Karşısında durunca seni görürsün." }
  ];
  const quiz = [
    { q: "Kızıl Gezegen olarak bilinen gezegen hangisi?", choices: ["Venüs", "Mars", "Merkür"], answer: 1 },
    { q: "Bir yetişkin insanın vücudunda yaklaşık kaç kemik bulunur?", choices: ["206", "106", "306"], answer: 0 },
    { q: "Dünyanın en büyük okyanusu hangisidir?", choices: ["Atlas", "Hint", "Pasifik"], answer: 2 },
    { q: "Bitkiler fotosentez sırasında en çok hangi gazı kullanır?", choices: ["Karbondioksit", "Oksijen", "Azot"], answer: 0 },
    { q: "Işığın boşluktaki hızı yaklaşık kaç km/s?", choices: ["30.000", "300.000", "3.000"], answer: 1 }
  ];
  const stories = [
    { title: "Sisli istasyon", intro: "Son tren kalkmış. Peronda üzerinde kendi adın yazan bir zarf buluyorsun.", choices: [["Zarfı aç", "Not seni saat kulesine çağırıyor. İçeride istasyonun kayıp saatini buluyor, eski bir bulmacanın ilk parçasını keşfediyorsun."], ["İstasyondan yardım iste", "Görevli zarfın haritasını tanıyor. Birlikte küçük bir araştırma başlatıp kayıp saatin izini sürüyorsunuz."]] },
    { title: "Fenerdeki ışık", intro: "Kıyıdaki deniz feneri yıllardır kapalı; bu gece ışığı üç kez yanıp sönüyor.", choices: [["Fenerin merdivenlerini çık", "Fenerin tepesinde eski bir deniz haritası buluyorsun. Işık, yıllar önce kaybolan araştırma teknesinin rotasını gösteriyormuş."], ["Kıyıda işaret ver", "Kayalıklardan bir sandal beliriyor. İçindeki denizci, fenerin ışığını uzaktan çalıştıran bir düzenek kurduğunu anlatıyor."]] },
    { title: "Bahçedeki kapı", intro: "Mahallendeki eski bahçede yalnızca yağmurdan sonra görünen küçük bir kapı buluyorsun.", choices: [["Kapıyı çal", "Kapı açılıyor ve içeride mahallenin anılarını toplayan minik bir kütüphane görüyorsun. İlk kitabın senin bugünkü keşfin oluyor."], ["Kapının çevresini incele", "Taşların altındaki işaretler seni bahçenin kurucusunun notlarına götürüyor. Gizli kapının neden yalnız yağmurda göründüğünü çözüyorsun."]] }
  ];
  let storyRound = 0;
  let round = 0;
  let memoryTimer;
  let wordChainLength = 0;
  const el = (tag, text, cls) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (cls) node.className = cls; return node; };
  function openActivity(title, description) {
    window.clearInterval(memoryTimer);
    panel.hidden = false; panel.replaceChildren(el("h3", title), el("p", description));
    setState("exploring", title + " etkinliği açık.");
  }
  function action(text, fn, cls = "activity-action") { const button = el("button", text, cls); button.type = "button"; button.addEventListener("click", fn); return button; }
  function feedback(text, good = false) { let line = panel.querySelector("[data-feedback]"); if (!line) { line = el("p", "", "activity-feedback"); line.dataset.feedback = "true"; panel.append(line); } line.textContent = text; line.dataset.good = String(good); }
  function input(placeholder) { const field = el("input"); field.type = "text"; field.placeholder = placeholder; field.setAttribute("aria-label", placeholder); panel.append(field); return field; }
  function startRiddle() {
    recordAs ||= "riddle"; const item = riddles[round++ % riddles.length]; openActivity("Bilmece", item.q);
    const field = input("Cevabın");
    panel.append(action("Yanıtla", () => { const answer = field.value.trim().toLocaleLowerCase("tr"); if (item.a.includes(answer)) completeActivity("Doğru bildin! Harika çözüm. Etkinlik tamamlandı."); else feedback("Henüz değil. İstersen ipucunu kullan."); }));
    panel.append(action("İpucu", () => feedback(item.h), "activity-action secondary"));
    panel.append(action("Çözümü göster", () => completeActivity(`Yanıt: ${item.a[0]}. Yeni bilmecede tekrar deneyebilirsin.`), "activity-action secondary"));
    panel.append(action("Başka bilmece", startRiddle, "activity-action secondary"));
  }
  function startQuiz() {
    recordAs ||= "quiz"; round = 0; let score = 0;
    const show = () => {
      if (round >= quiz.length) { openActivity("Tur tamamlandı", `${quiz.length} soruda ${score} doğru. ${score === quiz.length ? "Kusursuz tur!" : "Yeniden deneyerek skorunu geliştirebilirsin."}`); completeActivity(`${quiz.length} soruluk bilgi turu tamamlandı · ${score}/${quiz.length} doğru.`); panel.append(action("Yeniden oyna", startQuiz)); return; }
      const item = quiz[round]; openActivity(`Bilgi turu · ${round + 1}/${quiz.length}`, item.q);
      item.choices.forEach((choice, i) => panel.append(action(choice, () => { if (i === item.answer) score++; round++; show(); }, "activity-action choice")));
      const footer = el("small", `Skor: ${score}`); footer.className = "activity-score"; panel.append(footer);
    }; show();
  }
  function startMemory() {
    recordAs ||= "memory";
    const words = ["menekşe", "pusula", "martı", "anahtar", "bulut"];
    window.clearInterval(memoryTimer);
    openActivity("Hafıza oyunu", "Kelimeleri 8 saniye incele; sonra hatırladıklarını yaz.");
    const list = el("p", words.join(" · "), "memory-words"); panel.append(list);
    let remaining = 8; const timer = el("small", `Gizlenmesine ${remaining} saniye`); panel.append(timer);
    memoryTimer = window.setInterval(() => { remaining--; timer.textContent = remaining ? `Gizlenmesine ${remaining} saniye` : "Şimdi hatırladıklarını yaz."; if (!remaining) { window.clearInterval(memoryTimer); list.textContent = "Kelimeler gizlendi."; } }, 1000);
    panel.append(action("Hazırım", () => { window.clearInterval(memoryTimer); list.textContent = "Kelimeler gizlendi."; timer.textContent = ""; const field = input("Kelimeleri virgülle ayır"); panel.append(action("Kontrol et", () => { const guess = new Set(field.value.toLocaleLowerCase("tr").split(/[;,]/).map(x => x.trim())); const score = words.filter(x => guess.has(x)).length; completeActivity(`${score}/${words.length} kelimeyi hatırladın. Hafıza turu tamamlandı.`); })); }, "activity-action secondary"));
  }
  function startWord(lastWord = "") {
    recordAs ||= "word";
    const starters = ["merak", "kitap", "deniz", "bulut", "ışık"];
    const previous = lastWord || starters[round++ % starters.length]; openActivity("Kelime zinciri", `${lastWord ? `Güzel! “${lastWord}” kabul edildi. ` : `Başlangıç kelimesi: ${previous}. `}Son harf “${previous.slice(-1)}”. Bu harfle başlayan bir Türkçe kelime yaz.`);
    const field = input("Yeni kelime");
    panel.append(action("Kelimeyi gönder", () => { const value = field.value.trim().toLocaleLowerCase("tr"); if (value.length < 2 || value[0] !== previous.slice(-1)) { feedback(`Kelime “${previous.slice(-1)}” harfiyle başlamalı.`); return; } if (++wordChainLength >= 5) { wordChainLength = 0; completeActivity("Beş kelimelik zinciri tamamladın! Yeni bir tur başlatabilirsin."); panel.append(action("Yeni tur", () => startWord(""))); return; } openActivity("Kelime zinciri", `“${value}” kabul edildi (${wordChainLength}/5). Sıradaki kelime “${value.slice(-1)}” harfiyle başlamalı.`); panel.append(action("Devam et", () => startWord(value)), action("Baştan", () => { wordChainLength = 0; startWord(""); }, "activity-action secondary")); }, "activity-action"));
  }
  function startStory() {
    recordAs ||= "story";
    const story = stories[storyRound++ % stories.length];
    openActivity(story.title, story.intro);
    story.choices.forEach(([choice, endingText], index) => panel.append(action(choice, () => ending(endingText), index ? "activity-action secondary" : "activity-action")));
  }
  function ending(text) { openActivity("Hikâyenin sonu", text); completeActivity("Hikâyeyi tamamladın. Yeni seçimlerle farklı bir son keşfedebilirsin."); panel.append(action("Yeni kararlar ver", startStory)); }
  function startGuess() {
    recordAs ||= "guess"; const target = Math.floor(Math.random() * 20) + 1; let attempts = 0;
    openActivity("Sayı tahmini", "1 ile 20 arasında bir sayı tuttum. Altı denemede bulabilir misin?"); const field = input("1–20 arasında tahmin");
    panel.append(action("Tahmin et", () => { const guess = Number(field.value); if (!Number.isInteger(guess) || guess < 1 || guess > 20) { feedback("1 ile 20 arasında tam sayı yaz."); return; } attempts++; if (guess === target) { completeActivity(`${attempts}. denemede buldun!`); return; } if (attempts >= 6) { completeActivity(`Tur tamamlandı. Tuttuğum sayı ${target} idi; yeni turda tekrar dene.`); return; } feedback(`${guess < target ? "Daha büyük" : "Daha küçük"}. Kalan deneme: ${6 - attempts}.`); field.value = ""; field.focus(); }));
  }
  const localActivities = { riddle: startRiddle, quiz: startQuiz, memory: startMemory, word: startWord, story: startStory, guess: startGuess };
  for (const button of document.querySelectorAll("[data-activity]")) button.addEventListener("click", () => { recordAs = button.dataset.activity; if (button.dataset.activity === "word") wordChainLength = 0; localActivities[button.dataset.activity]?.(); });
  document.querySelector('[data-activity="daily"]')?.addEventListener("click", () => { const id = window.EyrionDiscoveryState?.dailyChallenge() || "riddle"; recordAs = "daily"; localActivities[id]?.(); });
  for (const button of document.querySelectorAll("[data-companion-prompt]")) button.addEventListener("click", () => {
    const prompt = button.dataset.companionPrompt;
    if (!prompt || typeof window.NOVA?.sendMessage !== "function") { setState("error", "Sohbet başlatılamadı. Ana sohbeti açıp tekrar dene."); return; }
    document.getElementById("companionBack")?.click(); window.NOVA.sendMessage(prompt);
  });
})();
