"use strict";

/*
 * NOVA AI — ElevenLabs destekli sesli sohbet
 *
 * - Web Speech API: Türkçe konuşma tanıma
 * - ElevenLabs: Türkçe sesli yanıt
 * - Mevcut app.js ve /api/chat korunur
 * - /api/tts üzerinden ses oluşturulur
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

  let recognition = null;
  let voiceEnabled = false;
  let recognitionRunning = false;
  let waitingForReply = false;
  let speaking = false;
  let restartTimer = null;
  let currentAudio = null;
  let audioUrl = null;
  let requestCounter = 0;
  let activeSpeechRequest = 0;

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

  function scheduleRecognitionRestart(delay = 450) {
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
      setVoiceStatus("İnternet bağlantısı gerekli.", "error");
      return;
    }

    try {
      recognition.start();
    } catch (error) {
      if (error.name !== "InvalidStateError") {
        console.warn("NOVA Voice: Mikrofon başlatılamadı.", error);
        setVoiceStatus("Mikrofon başlatılamadı. Tekrar dene.", "error");
      }
    }
  }

  function releaseAudioUrl() {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      audioUrl = null;
    }
  }

  function stopAudio() {
    activeSpeechRequest += 1;

    if (currentAudio) {
      currentAudio.onended = null;
      currentAudio.onerror = null;
      currentAudio.pause();
      currentAudio.src = "";
      currentAudio = null;
    }

    releaseAudioUrl();
    speaking = false;
  }

  async function speakReply(text) {
    const answer = String(text || "").trim();

    if (!answer || !voiceEnabled) {
      waitingForReply = false;
      scheduleRecognitionRestart();
      return;
    }

    const speechRequest = ++activeSpeechRequest;

    waitingForReply = false;
    speaking = true;
    stopRecognition();
    stopAudio();

    // stopAudio sayaç artırdığı için bu isteğin kimliğini tekrar ayarla.
    const currentRequest = ++activeSpeechRequest;

    setVoiceStatus("NOVA'nın sesi hazırlanıyor…", "speaking");

    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text: answer.slice(0, 2500)
        })
      });

      if (
        !voiceEnabled ||
        currentRequest !== activeSpeechRequest ||
        speechRequest > activeSpeechRequest
      ) {
        return;
      }

      if (!response.ok) {
        let message = "Ses oluşturulamadı.";

        try {
          const data = await response.json();
          if (data?.error) message = data.error;
        } catch {
          // Sunucu JSON dönmediyse genel hata mesajı kullanılır.
        }

        throw new Error(message);
      }

      const audioBlob = await response.blob();

      if (!voiceEnabled || currentRequest !== activeSpeechRequest) {
        return;
      }

      releaseAudioUrl();
      audioUrl = URL.createObjectURL(audioBlob);
      currentAudio = new Audio(audioUrl);
      currentAudio.preload = "auto";

      currentAudio.onended = () => {
        if (currentRequest !== activeSpeechRequest) return;

        currentAudio = null;
        releaseAudioUrl();
        speaking = false;

        if (voiceEnabled) {
          setVoiceStatus("Seni dinliyorum…", "listening");
          scheduleRecognitionRestart(500);
        } else {
          setVoiceStatus("Sesli sohbet kapalı", "idle");
        }
      };

      currentAudio.onerror = () => {
        if (currentRequest !== activeSpeechRequest) return;

        currentAudio = null;
        releaseAudioUrl();
        speaking = false;

        if (voiceEnabled) {
          setVoiceStatus("Ses oynatılamadı. Yeniden dinlemeye geçiliyor.", "error");
          scheduleRecognitionRestart(800);
        }
      };

      setVoiceStatus("NOVA konuşuyor…", "speaking");

      try {
        await currentAudio.play();
      } catch (error) {
        if (currentRequest !== activeSpeechRequest) return;

        console.warn("NOVA Voice: Ses oynatılamadı.", error);
        stopAudio();

        if (voiceEnabled) {
          setVoiceStatus(
            "Ses başlatılamadı. Sayfayla etkileşip tekrar dene.",
            "error"
          );
          scheduleRecognitionRestart(1000);
        }
      }
    } catch (error) {
      if (!voiceEnabled || currentRequest !== activeSpeechRequest) return;

      console.error("NOVA Voice: ElevenLabs ses hatası.", error);

      speaking = false;
      setVoiceStatus(
        `Ses oluşturulamadı: ${error.message || "Bilinmeyen hata"}`,
        "error"
      );
      scheduleRecognitionRestart(1000);
    }
  }

  function setupRecognition() {
    if (!SpeechRecognition) {
      toggleButton.disabled = true;
      setVoiceStatus(
        "Konuşma tanıma desteklenmiyor. Chrome veya Edge deneyebilirsin.",
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

      input.value = text;
      input.dispatchEvent(new Event("input", { bubbles: true }));

      waitingForReply = true;
      requestCounter += 1;

      setVoiceStatus("Söylediklerin NOVA'ya gönderiliyor…", "speaking");
      stopRecognition();

      if (typeof form.requestSubmit === "function") {
        form.requestSubmit();
      } else {
        form.dispatchEvent(
          new Event("submit", {
            bubbles: true,
            cancelable: true
          })
        );
      }
    };

    recognition.onerror = (event) => {
      console.warn("NOVA Voice: Konuşma tanıma hatası.", event.error);

      if (!voiceEnabled) return;

      if (
        event.error === "not-allowed" ||
        event.error === "service-not-allowed"
      ) {
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
          "Konuşma tanıma bağlantı hatası verdi. İnternet gerekebilir.",
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
    clearRestartTimer();
    stopAudio();

    if (recognition && recognitionRunning) {
      try {
        recognition.stop();
      } catch {
        // Mikrofon zaten durmuş olabilir.
      }
    }

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
   * app.js içindeki fetch işlemini sarmalar.
   * /api/chat yanıtını kopyadan okur; orijinal Response korunur.
   */
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    const requestUrl =
      args[0] instanceof Request ? args[0].url : String(args[0]);

    let isChatRequest = false;

    try {
      const url = new URL(requestUrl, window.location.href);
      isChatRequest = url.pathname.endsWith("/api/chat");
    } catch {
      isChatRequest = requestUrl.includes("/api/chat");
    }

    let response;

    try {
      response = await originalFetch(...args);
    } catch (error) {
      if (isChatRequest && voiceEnabled) {
        waitingForReply = false;
        setVoiceStatus(
          "Bağlantı kurulamadı. Yeniden dinlemeye geçiliyor.",
          "error"
        );
        scheduleRecognitionRestart(900);
      }

      throw error;
    }

    if (!isChatRequest || !voiceEnabled) return response;

    try {
      const data = await response.clone().json();

      if (
        response.ok &&
        typeof data?.reply === "string" &&
        data.reply.trim()
      ) {
        await speakReply(data.reply);
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
      speaking = false;
      scheduleRecognitionRestart(900);
    }

    return response;
  };

  updateButtons();

  if (!SpeechRecognition) {
    setVoiceStatus(
      "Konuşma tanıma bulunamadı. Chrome veya Edge kullan.",
      "error"
    );
  }

  window.addEventListener("beforeunload", () => {
    clearRestartTimer();

    try {
      recognition?.abort();
    } catch {
      // Sayfa kapanırken mikrofon durmuş olabilir.
    }

    stopAudio();
  });

  window.NOVAVoice = Object.freeze({
    start: startVoiceChat,
    stop: stopVoiceChat,
    get active() {
      return voiceEnabled;
    }
  });

  console.info("✦ NOVA Voice — ElevenLabs modu yüklendi.");
})();
