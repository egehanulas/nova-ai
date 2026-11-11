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
    speaking: ["Yanıtlıyorum", "NOVA sesli olarak konuşuyor."],
    working: ["İş başında", "İstenen görev gerçekten yürütülüyor."],
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
    if (["success", "error"].includes(state)) {
      resetTimer = window.setTimeout(() => setState("idle"), 6500);
    }
  }

  window.addEventListener("nova:companion-state", (event) => {
    const payload = event.detail || {};
    setState(payload.state, payload.message);
  });

  for (const button of document.querySelectorAll("[data-companion-prompt]")) {
    button.addEventListener("click", () => {
      const prompt = button.dataset.companionPrompt;
      if (!prompt || typeof window.NOVA?.sendMessage !== "function") {
        setState("error", "Sohbet başlatılamadı. Ana sohbeti açıp tekrar dene.");
        return;
      }
      document.getElementById("companionBack")?.click();
      window.NOVA.sendMessage(prompt);
    });
  }
})();
