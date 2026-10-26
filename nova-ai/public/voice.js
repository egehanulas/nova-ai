
"use strict";

/*
 * NOVA AI — Ücretsiz tarayıcı tabanlı sesli sohbet
 *
 * Kullanılan özellikler:
 * - Web Speech API (konuşma tanıma)
 * - SpeechSynthesis API (sesli cevap)
 *
 * Mevcut app.js ve /api/chat endpoint'i korunur.
 */

(() => {
  const $ = (id) => document.getElementById(id);

  const toggleButton = $("voiceToggle");
  const toggleLabel = $("voiceToggleLabel");
  const stopButton = $("voiceStop");
  const statusLabel = $("voiceStatus");
  const input = $("prompt");
  const form = $("form");

  if (!toggleButton || !stopButton || !statusLabel || !input || !form) {
    console.warn("NOVA Voice: Sesli sohbet arayüzü bulunamadı.");
    return;
  }

  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  const synthesis = window.speechSynthesis;

  let recognition = null;
  let voiceEnabled = false;
  let recognitionRunning = false;
  let waitingForReply = false;
  let speaking = false;
  let restartTimer = null;
  let lastSpokenReply = "";
  let requestCounter = 0;

  function setVoiceStatus(message, state = "idle") {
    statusLabel.textContent = message;
    statusLabel.dataset.state = state;
  }

  function updateButtons() {
    toggleButton.setAttribute("aria-pressed", String(voiceEnabled));
    toggleButton.classList.toggle("active", voiceEnabled);

    if (toggleLabel) {
      toggleLabel.textContent = voiceEnabled
        ? "Sesli sohbet açık"
        : "Sesli sohbeti başlat";
    }

    toggleButton.setAttribute(
      "aria-label",
      voiceEnabled ? "Sesli sohbeti kapat" : "Sesli sohbeti başlat"
    );

    stopButton.disabled = !voiceEnabled;
  }

  function clearRestartTimer() {
    if (restartTimer !== null) {
      window.clearTimeout(restartTimer);
      restartTimer = null;
    }
  }

  function stopRecognition() {
    clearRestartTimer();

    if (!recognition || !recognitionRunning) return;

    try {
      recognition.stop();
    } catch (error) {
      console.debug("NOVA Voice: Dinleme durdurulamadı.", error);
    }
  }

  function scheduleRecognitionRestart(delay = 350) {
    clearRestartTimer();

    if (!voiceEnabled || waitingForReply || speaking) return;

    restartTimer = window.setTimeout(() => {
      restartTimer = null;
      startRecognition();
    }, delay);
  }

  function startRecognition() {
    if (!voiceEnabled || !recognition) return;
    if (recognitionRunning || waitingForReply || speaking) return;

    if (!navigator.onLine) {
      setVoiceStatus("İnternet bağlantısı gerekli olabilir.", "error");
      return;
    }

    try {
      recognition.start();
    } catch (error) {
      // Tarayıcı zaten dinliyorsa ikinci kez başlatmayı denemiyoruz.
      if (error.name !== "InvalidStateError") {
        console.warn("NOVA Voice: Mikrofon başlatılamadı.", error);
        setVoiceStatus("Mikrofon başlatılamadı. Tekrar dene.", "error");
      }
    }
  }

  function chooseTurkishVoice() {
    if (!synthesis) return null;

    const voices = synthesis.getVoices();

    return (
      voices.find((voice) => /^tr[-_]/i.test(voice.lang) && /female|woman| kadın/i.test(voice.name)) ||
      voices.find((voice) => /^tr[-_]/i.test(voice.lang)) ||
      voices.find((voice) => voice.lang.toLowerCase().startsWith("tr")) ||
      null
    );
  }

  function speakReply(text) {
    const answer = String(text || "").trim();

    if (!answer || !voiceEnabled || !synthesis) {
      waitingForReply = false;
      scheduleRecognitionRestart();
      return;
    }

    // Aynı yanıtın yanlışlıkla iki defa okunmasını önle.
    if (answer === lastSpokenReply && synthesis.speaking) return;

    lastSpokenReply = answer;
    waitingForReply = false;
    speaking = true;

    stopRecognition();
    synthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(answer);
    utterance.lang = "tr-TR";
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;

    const turkishVoice = chooseTurkishVoice();
    if (turkishVoice) utterance.voice = turkishVoice;

    utterance.onstart = () => {
      setVoiceStatus("NOVA konuşuyor…", "speaking");
    };

    utterance.onend = () => {
      speaking = false;

      if (voiceEnabled) {
        setVoiceStatus("Seni dinliyorum…", "listening");
        scheduleRecognitionRestart(450);
      } else {
        setVoiceStatus("Sesli sohbet kapalı", "idle");
      }
    };

    utterance.onerror = (event) => {
      speaking = false;
      console.warn("NOVA Voice: Seslendirme hatası.", event.error);

      if (voiceEnabled) {
        setVoiceStatus(
          "Ses okunamadı; dinleme yeniden başlayacak.",
          "error"
        );
        scheduleRecognitionRestart(700);
      }
    };

    // Uzun cevaplarda tarayıcının metni kesmesini önlemek için
    // tek bir utterance kullanılır; desteklenen uzunluk tarayıcıya bağlıdır.
    synthesis.speak(utterance);
  }

  function setupRecognition() {
    if (!SpeechRecognition) {
      toggleButton.disabled = true;
      setVoiceStatus(
        "Bu tarayıcı konuşma tanımayı desteklemiyor. Chrome veya Edge deneyebilirsin.",
        "error"
      );
      return false;
    }

    recognition = new SpeechRecognition();
    recognition.lang = "tr-TR";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      recognitionRunning = true;

      if (voiceEnabled && !waitingForReply && !speaking) {
        setVoiceStatus("Seni dinliyorum…", "listening");
      }
    };

    recognition.onresult = (event) => {
      let finalText = "";

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];

        if (result.isFinal && result[0]?.transcript) {
          finalText += result[0].transcript;
        }
      }

      const text = finalText.trim();
      if (!text || !voiceEnabled || waitingForReply || speaking) return;

      // Tanınan konuşmayı mevcut sohbet alanına gönder.
      input.value = text;
      input.dispatchEvent(new Event("input", { bubbles: true }));

      waitingForReply = true;
      requestCounter += 1;

      setVoiceStatus("Söylediklerin NOVA'ya gönderiliyor…", "speaking");
      stopRecognition();

      if (typeof form.requestSubmit === "function") {
        form.requestSubmit();
      } else {
        form.dispatchEvent(new Event("submit", {
          bubbles: true,
          cancelable: true
        }));
      }
    };

    recognition.onerror = (event) => {
      console.warn("NOVA Voice: Konuşma tanıma hatası.", event.error);

      if (!voiceEnabled) return;

      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        voiceEnabled = false;
        waitingForReply = false;
        updateButtons();
        setVoiceStatus(
          "Mikrofon izni verilmedi. Tarayıcı ayarlarından mikrofon iznini aç.",
          "error"
        );
        return;
      }

      if (event.error === "audio-capture") {
        setVoiceStatus("Mikrofon bulunamadı veya kullanılamıyor.", "error");
        return;
      }

      if (event.error === "language-not-supported") {
        setVoiceStatus("Türkçe konuşma tanıma desteklenmiyor.", "error");
        return;
      }

      if (event.error === "network") {
        setVoiceStatus(
          "Konuşma tanıma bağlantı hatası verdi. Tarayıcı hizmeti internet gerektirebilir.",
          "error"
        );
      }
    };

    recognition.onend = () => {
      recognitionRunning = false;

      if (voiceEnabled && !waitingForReply && !speaking) {
        scheduleRecognitionRestart(500);
      }
    };

    return true;
  }

  function startVoiceChat() {
    if (!recognition && !setupRecognition()) return;

    voiceEnabled = true;
    waitingForReply = false;
    updateButtons();

    setVoiceStatus("Mikrofon izni bekleniyor…", "listening");
    startRecognition();
  }

  function stopVoiceChat() {
    voiceEnabled = false;
    waitingForReply = false;
    speaking = false;
    clearRestartTimer();

    if (recognition && recognitionRunning) {
      try {
        recognition.stop();
      } catch {
        // Zaten durmuş olabilir.
      }
    }

    if (synthesis) synthesis.cancel();

    updateButtons();
    setVoiceStatus("Sesli sohbet kapalı", "idle");
  }

  toggleButton.addEventListener("click", () => {
    if (voiceEnabled) {
      stopVoiceChat();
    } else {
      startVoiceChat();
    }
  });

  stopButton.addEventListener("click", stopVoiceChat);

  /*
   * Mevcut fetch işlevini sarmalıyoruz.
   * /api/chat başarılı yanıt döndürdüğünde cevabı seslendiriyoruz.
   * Orijinal Response nesnesi app.js tarafından kullanılmaya devam eder.
   */
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    const requestUrl = args[0] instanceof Request
      ? args[0].url
      : String(args[0]);

    const isChatRequest = (() => {
      try {
        const url = new URL(requestUrl, window.location.href);
        return url.pathname.endsWith("/api/chat");
      } catch {
        return requestUrl.includes("/api/chat");
      }
    })();

    let response;

    try {
      response = await originalFetch(...args);
    } catch (error) {
      if (isChatRequest && voiceEnabled) {
        waitingForReply = false;
        setVoiceStatus("Bağlantı kurulamadı. Yeniden dinlemeye geçiliyor.", "error");
        scheduleRecognitionRestart(900);
      }
      throw error;
    }

    if (!isChatRequest || !voiceEnabled) return response;

    try {
      const data = await response.clone().json();

      if (response.ok && typeof data?.reply === "string" && data.reply.trim()) {
        speakReply(data.reply);
      } else {
        waitingForReply = false;
        setVoiceStatus(
          data?.error || "NOVA yanıt veremedi. Tekrar konuşabilirsin.",
          "error"
        );
        scheduleRecognitionRestart(900);
      }
    } catch (error) {
      console.warn("NOVA Voice: Yanıt sesli sohbete aktarılamadı.", error);
      waitingForReply = false;
      scheduleRecognitionRestart(900);
    }

    return response;
  };

  updateButtons();

  if (!SpeechRecognition) {
    setVoiceStatus(
      "Konuşma tanıma desteği bulunamadı. Chrome veya Edge kullan.",
      "error"
    );
  } else if (!synthesis) {
    toggleButton.disabled = true;
    setVoiceStatus("Bu tarayıcı sesli yanıtı desteklemiyor.", "error");
  }

  window.addEventListener("beforeunload", () => {
    clearRestartTimer();
    try {
      recognition?.abort();
    } catch {
      // Sayfa kapanırken mikrofon zaten durmuş olabilir.
    }
    synthesis?.cancel();
  });

  // İsteğe bağlı konsol kontrolü.
  window.NOVAVoice = Object.freeze({
    start: startVoiceChat,
    stop: stopVoiceChat,
    get active() {
      return voiceEnabled;
    }
  });

  console.info("✦ NOVA Voice modülü yüklendi.");
})();
