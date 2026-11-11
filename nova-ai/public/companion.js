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
  let round = 0;
  let memoryTimer;
  const el = (tag, text, cls) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (cls) node.className = cls; return node; };
  function openActivity(title, description) {
    panel.hidden = false; panel.replaceChildren(el("h3", title), el("p", description));
    setState("exploring", title + " etkinliği açık.");
  }
  function action(text, fn, cls = "activity-action") { const button = el("button", text, cls); button.type = "button"; button.addEventListener("click", fn); return button; }
  function feedback(text, good = false) { let line = panel.querySelector("[data-feedback]"); if (!line) { line = el("p", "", "activity-feedback"); line.dataset.feedback = "true"; panel.append(line); } line.textContent = text; line.dataset.good = String(good); }
  function input(placeholder) { const field = el("input"); field.type = "text"; field.placeholder = placeholder; field.setAttribute("aria-label", placeholder); panel.append(field); return field; }
  function startRiddle() {
    const item = riddles[round++ % riddles.length]; openActivity("Bilmece", item.q);
    const field = input("Cevabın");
    panel.append(action("Yanıtla", () => { const answer = field.value.trim().toLocaleLowerCase("tr"); feedback(item.a.includes(answer) ? "Doğru bildin! Harika çözüm." : "Henüz değil. İstersen ipucunu kullan.", item.a.includes(answer)); }));
    panel.append(action("İpucu", () => feedback(item.h), "activity-action secondary"));
    panel.append(action("Başka bilmece", startRiddle, "activity-action secondary"));
  }
  function startQuiz() {
    round = 0; let score = 0;
    const show = () => {
      if (round >= quiz.length) { openActivity("Tur tamamlandı", `${quiz.length} soruda ${score} doğru. ${score === quiz.length ? "Kusursuz tur!" : "Yeniden deneyerek skorunu geliştirebilirsin."}`); panel.append(action("Yeniden oyna", startQuiz)); return; }
      const item = quiz[round]; openActivity(`Bilgi turu · ${round + 1}/${quiz.length}`, item.q);
      item.choices.forEach((choice, i) => panel.append(action(choice, () => { if (i === item.answer) score++; round++; show(); }, "activity-action choice")));
      const footer = el("small", `Skor: ${score}`); footer.className = "activity-score"; panel.append(footer);
    }; show();
  }
  function startMemory() {
    const words = ["menekşe", "pusula", "martı", "anahtar", "bulut"];
    window.clearInterval(memoryTimer);
    openActivity("Hafıza oyunu", "Kelimeleri 8 saniye incele; sonra hatırladıklarını yaz.");
    const list = el("p", words.join(" · "), "memory-words"); panel.append(list);
    let remaining = 8; const timer = el("small", `Gizlenmesine ${remaining} saniye`); panel.append(timer);
    memoryTimer = window.setInterval(() => { remaining--; timer.textContent = remaining ? `Gizlenmesine ${remaining} saniye` : "Şimdi hatırladıklarını yaz."; if (!remaining) { window.clearInterval(memoryTimer); list.textContent = "Kelimeler gizlendi."; } }, 1000);
    panel.append(action("Hazırım", () => { window.clearInterval(memoryTimer); list.textContent = "Kelimeler gizlendi."; timer.textContent = ""; const field = input("Kelimeleri virgülle ayır"); panel.append(action("Kontrol et", () => { const guess = new Set(field.value.toLocaleLowerCase("tr").split(/[;,]/).map(x => x.trim())); const score = words.filter(x => guess.has(x)).length; feedback(`${score}/${words.length} kelimeyi hatırladın. ${score >= 4 ? "Çok iyi!" : "Tekrar deneyebilirsin."}`, score >= 4); })); }, "activity-action secondary"));
  }
  function startWord(lastWord = "") {
    const starters = ["merak", "kitap", "deniz", "bulut", "ışık"];
    const previous = lastWord || starters[round++ % starters.length]; openActivity("Kelime zinciri", `${lastWord ? `Güzel! “${lastWord}” kabul edildi. ` : `Başlangıç kelimesi: ${previous}. `}Son harf “${previous.slice(-1)}”. Bu harfle başlayan bir Türkçe kelime yaz.`);
    const field = input("Yeni kelime");
    panel.append(action("Kelimeyi gönder", () => { const value = field.value.trim().toLocaleLowerCase("tr"); if (value.length < 2 || value[0] !== previous.slice(-1)) { feedback(`Kelime “${previous.slice(-1)}” harfiyle başlamalı.`); return; } openActivity("Kelime zinciri", `“${value}” kabul edildi. Sıradaki kelime “${value.slice(-1)}” harfiyle başlamalı.`); panel.append(action("Devam et", () => startWord(value)), action("Baştan", () => startWord(""), "activity-action secondary")); }, "activity-action"));
  }
  function startStory() {
    openActivity("Sisli istasyon", "Son tren kalkmış. Peronda üzerinde kendi adın yazan bir zarf buluyorsun. Ne yaparsın?");
    panel.append(action("Zarfı aç", () => { openActivity("Bir not", "Notta yalnızca şu yazıyor: ‘Saat kulesine gel. Yanında kimseyi getirme.’ Kuleye vardığında kapı aralık."); panel.append(action("İçeri gir", () => ending("Merdivenlerin sonunda istasyonun kayıp saatini buluyorsun. Zarf, sana ait eski bir bulmacanın ilk parçasıymış.")), action("Dışarıdan seslen", () => ending("İçeriden bir görevli çıkıyor. Saatin yıllardır durduğunu, onu ancak senin fark edebileceğini söylüyor."))); }), action("İstasyondan yardım iste", () => ending("Görevli zarfın içindeki haritayı görünce gülümsüyor. Kayıp saat için küçük bir araştırma başlıyor."), "activity-action secondary"));
  }
  function ending(text) { openActivity("Hikâyenin sonu", text); panel.append(action("Yeni kararlar ver", startStory)); }
  for (const button of document.querySelectorAll("[data-activity]")) button.addEventListener("click", () => ({ riddle: startRiddle, quiz: startQuiz, memory: startMemory, word: startWord, story: startStory }[button.dataset.activity] || (() => {}))());
  for (const button of document.querySelectorAll("[data-companion-prompt]")) button.addEventListener("click", () => {
    const prompt = button.dataset.companionPrompt;
    if (!prompt || typeof window.NOVA?.sendMessage !== "function") { setState("error", "Sohbet başlatılamadı. Ana sohbeti açıp tekrar dene."); return; }
    document.getElementById("companionBack")?.click(); window.NOVA.sendMessage(prompt);
  });
})();
