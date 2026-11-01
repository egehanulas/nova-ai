
"use strict";

/*
 * NOVA AI — Ücretsiz tarayıcı sesli sohbeti
 * Türkçe konuşma tanıma ve tarayıcı seslendirmesi.
 * ElevenLabs veya /api/tts kullanılmaz.
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

  const synth = window.speechSynthesis;

  let recognition = null;
  let voiceEnabled = false;
  let recognitionRunning = false;
  let recognitionError = false;
  let waitingForReply = false;
  let speaking = false;
  let restartTimer = null;
  let speechRequest = 0;
  let selectedVoice = null;
  let microphoneRequestInProgress = false;

  function setVoiceStatus(message, state = "idle") {
    statusLabel.textContent = message;
    statusLabel.dataset.state = state;
  }

  function updateButtons() {
    toggleButton.disabled = !SpeechRecognition;
    toggleButton.setAttribute("aria-pressed", String(voiceEnabled));
    toggleButton.classList.toggle("active", voiceEnabled);
    toggleButton.setAttribute(
      "aria-label",
      voiceEnabled ? "Sesli sohbeti kapat" : "Sesli sohbeti başlat"
    );

    if (toggleLabel) {
      toggleLabel.textContent = voiceEnabled
        ? "Sesli sohbet açık"
        : "Sesli sohbeti başlat";
    }

    stopButton.disabled = !voiceEnabled;
  }

  const voiceChoice = $("voiceChoice");
  const voiceRate = $("voiceRate");
  const voiceRateValue = $("voiceRateValue");
  const voiceTestButton = $("voiceTest");
  const voiceSettingsStatus = $("voiceSettingsStatus");
  const VOICE_URI_KEY = "nova-ai-voice-uri";
  const VOICE_RATE_KEY = "nova-ai-voice-rate";

  function readPreference(key, fallback = "") {
    try {
      return window.localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  }

  function savePreference(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Private browsing or storage restrictions should not break voice chat.
    }
  }

  function getTurkishVoices() {
    return synth
      ? synth.getVoices().filter((voice) => String(voice.lang || "").toLowerCase().startsWith("tr"))
      : [];
  }

  function chooseTurkishVoice() {
    const voices = getTurkishVoices();
    const preferredUri = readPreference(VOICE_URI_KEY);
    return (
      voices.find((voice) => voice.voiceURI === preferredUri) ||
      voices.find((voice) => voice.localService) ||
      voices[0] ||
      null
    );
  }

  function updateVoiceSettings() {
    const voices = getTurkishVoices();
    selectedVoice = chooseTurkishVoice();

    if (voiceChoice) {
      const preferredUri = readPreference(VOICE_URI_KEY);
      const currentValue = voiceChoice.value;
      voiceChoice.replaceChildren();

      const automatic = document.createElement("option");
      automatic.value = "";
      automatic.textContent = "Otomatik Türkçe ses";
      voiceChoice.append(automatic);

      voices.forEach((voice) => {
        const option = document.createElement("option");
        option.value = voice.voiceURI;
        option.textContent = `${voice.name} · ${voice.lang}${voice.localService ? " · Bu cihazda" : ""}`;
        voiceChoice.append(option);
      });

      voiceChoice.value = voices.some((voice) => voice.voiceURI === preferredUri)
        ? preferredUri
        : currentValue && voices.some((voice) => voice.voiceURI === currentValue)
          ? currentValue
          : "";
    }

    const savedRate = Number(readPreference(VOICE_RATE_KEY, "0.95"));
    const rate = Number.isFinite(savedRate) ? Math.min(1.15, Math.max(0.85, savedRate)) : 0.95;
    if (voiceRate && document.activeElement !== voiceRate) voiceRate.value = String(rate);
    if (voiceRateValue) voiceRateValue.textContent = `${Number(voiceRate?.value || rate).toFixed(2)}×`;

    if (voiceSettingsStatus) {
      voiceSettingsStatus.textContent = voices.length
        ? `${voices.length} Türkçe ses bulundu.`
        : "Türkçe ses bulunamadı. Windows Ayarları > Saat ve Dil > Dil ve Bölge bölümünden Türkçe konuşma sesini yükleyebilirsin.";
    }
  }

  function getSpeechRate() {
    const value = Number(voiceRate?.value || readPreference(VOICE_RATE_KEY, "0.95"));
    return Number.isFinite(value) ? Math.min(1.15, Math.max(0.85, value)) : 0.95;
  }

  if (synth) {
    updateVoiceSettings();
    synth.addEventListener?.("voiceschanged", updateVoiceSettings);
  }

  voiceChoice?.addEventListener("change", () => {
    savePreference(VOICE_URI_KEY, voiceChoice.value);
    selectedVoice = chooseTurkishVoice();
    if (voiceSettingsStatus) {
      voiceSettingsStatus.textContent = voiceChoice.value
        ? "Seçtiğin ses kaydedildi."
        : "Otomatik Türkçe ses seçimi kullanılıyor.";
    }
  });

  voiceRate?.addEventListener("input", () => {
    const rate = getSpeechRate();
    if (voiceRateValue) voiceRateValue.textContent = `${rate.toFixed(2)}×`;
    savePreference(VOICE_RATE_KEY, String(rate));
  });

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

  function scheduleRecognitionRestart(delay = 500) {
    clearRestartTimer();

    if (!voiceEnabled || recognitionError || waitingForReply || speaking) return;

    restartTimer = window.setTimeout(() => {
      restartTimer = null;
      startRecognition();
    }, delay);
  }

  function startRecognition() {
    if (!voiceEnabled || !recognition || recognitionError) return;
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

  function stopSpeech() {
    speechRequest += 1;

    if (synth) {
      synth.cancel();
    }

    speaking = false;
  }

  function speakReply(text) {
    const answer = String(text || "").trim();

    if (!answer || !voiceEnabled) {
      waitingForReply = false;
      scheduleRecognitionRestart();
      return;
    }

    if (!synth || !("SpeechSynthesisUtterance" in window)) {
      waitingForReply = false;
      setVoiceStatus("Tarayıcı seslendirmeyi desteklemiyor.", "error");
      scheduleRecognitionRestart();
      return;
    }

    stopSpeech();
    const currentRequest = speechRequest;

    waitingForReply = false;
    speaking = true;
    stopRecognition();

    selectedVoice = chooseTurkishVoice();
    const chunks = answer.slice(0, 4000).match(/[^.!?…]+[.!?…]+["'”’)]*|[^.!?…]+$/g) || [answer.slice(0, 4000)];
    const speechChunks = [];
    let pending = "";

    chunks.forEach((chunk) => {
      const part = chunk.trim();
      if (!part) return;
      if (pending && (pending.length + part.length + 1 > 260)) {
        speechChunks.push(pending);
        pending = part;
      } else {
        pending = pending ? `${pending} ${part}` : part;
      }
    });
    if (pending) speechChunks.push(pending);

    let completedChunks = 0;
    const finishSpeech = () => {
      if (currentRequest !== speechRequest || completedChunks < speechChunks.length) return;
      speaking = false;
      if (voiceEnabled) {
        setVoiceStatus("Seni dinliyorum…", "listening");
        scheduleRecognitionRestart(450);
      } else {
        setVoiceStatus("Sesli sohbet kapalı", "idle");
      }
    };

    setVoiceStatus("NOVA'nın sesi hazırlanıyor…", "speaking");

    try {
      speechChunks.forEach((chunk, index) => {
        const utterance = new SpeechSynthesisUtterance(chunk);
        utterance.lang = "tr-TR";
        utterance.rate = getSpeechRate();
        utterance.pitch = 1;
        utterance.volume = 1;
        if (selectedVoice) utterance.voice = selectedVoice;

        utterance.onstart = () => {
          if (currentRequest === speechRequest && voiceEnabled && index === 0) {
            setVoiceStatus("NOVA konuşuyor…", "speaking");
          }
        };
        utterance.onend = () => {
          if (currentRequest !== speechRequest) return;
          completedChunks += 1;
          finishSpeech();
        };
        utterance.onerror = (event) => {
          if (currentRequest !== speechRequest) return;
          console.warn("NOVA Voice: Ses parçası okunamadı.", event.error);
          completedChunks += 1;
          finishSpeech();
        };
        synth.speak(utterance);
      });
    } catch (error) {
      speaking = false;
      console.error("NOVA Voice: Ses başlatılamadı.", error);
      setVoiceStatus("Ses başlatılamadı.", "error");
      scheduleRecognitionRestart(800);
    }
  }

  voiceTestButton?.addEventListener("click", () => {
    if (!synth || !("SpeechSynthesisUtterance" in window)) {
      if (voiceSettingsStatus) voiceSettingsStatus.textContent = "Bu uygulamada seslendirme desteklenmiyor.";
      return;
    }
    const resumeListening = voiceEnabled;
    if (resumeListening) stopRecognition();
    stopSpeech();
    speaking = true;
    const preview = new SpeechSynthesisUtterance("Merhaba, ben NOVA. Bugün sana nasıl yardımcı olabilirim?");
    preview.lang = "tr-TR";
    preview.rate = getSpeechRate();
    preview.pitch = 1;
    selectedVoice = chooseTurkishVoice();
    if (selectedVoice) preview.voice = selectedVoice;
    preview.onend = () => {
      speaking = false;
      if (voiceSettingsStatus) voiceSettingsStatus.textContent = "Ses denemesi tamamlandı.";
      if (resumeListening) scheduleRecognitionRestart(450);
    };
    preview.onerror = () => {
      speaking = false;
      if (voiceSettingsStatus) voiceSettingsStatus.textContent = "Ses denemesi başarısız oldu.";
      if (resumeListening) scheduleRecognitionRestart(700);
    };
    if (voiceSettingsStatus) voiceSettingsStatus.textContent = "NOVA'nın sesi deneniyor…";
    synth.speak(preview);
  });

  function setupRecognition() {
    if (!SpeechRecognition) {
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

      const spokenText = finalText.trim();

      if (!spokenText || !voiceEnabled || waitingForReply || speaking) {
        return;
      }

      input.value = spokenText;
      input.dispatchEvent(new Event("input", { bubbles: true }));

      waitingForReply = true;
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
        // Chromium's speech service can report a network error even while the
        // page itself is online. Do not restart in a tight loop and overwrite
        // the useful error with "Seni dinliyorum…".
        recognitionError = true;
        clearRestartTimer();
        setVoiceStatus(
          "Mikrofon açık ancak konuşma tanıma servisine bağlanılamadı. Sesli sohbeti kapatıp yeniden açmayı dene.",
          "error"
        );
        return;
      }

      if (event.error === "no-speech") {
        scheduleRecognitionRestart(500);
      }
    };

    recognition.onend = () => {
      recognitionRunning = false;

      if (voiceEnabled && !recognitionError && !waitingForReply && !speaking) {
        scheduleRecognitionRestart(1000);
      }
    };

    return true;
  }

  async function startVoiceChat() {
    if (microphoneRequestInProgress || voiceEnabled) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceStatus(
        "Mikrofon erişimi bu ortamda desteklenmiyor. Uygulamayı güncel Chrome, Edge veya NOVA masaüstü sürümünde aç.",
        "error"
      );
      return;
    }

    microphoneRequestInProgress = true;
    voiceEnabled = true;
    recognitionError = false;
    waitingForReply = false;
    updateButtons();
    setVoiceStatus("Mikrofon izni kontrol ediliyor…", "listening");

    try {
      // The browser/Windows permission prompt appears on the first request.
      // Once allowed, the browser remembers the decision for this origin.
      // Stop this temporary stream; SpeechRecognition will own the live capture.
      const microphoneStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      microphoneStream.getTracks().forEach((track) => track.stop());
    } catch (error) {
      console.warn("NOVA Voice: Mikrofon erişimi alınamadı.", error);
      voiceEnabled = false;
      updateButtons();

      if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
        setVoiceStatus(
          "Mikrofon izni verilmedi. İlk kullanımda çıkan tarayıcı/Windows izin penceresinde NOVA'ya izin ver.",
          "error"
        );
      } else if (error?.name === "NotFoundError" || error?.name === "OverconstrainedError") {
        setVoiceStatus("Bilgisayarda kullanılabilir bir mikrofon bulunamadı.", "error");
      } else if (error?.name === "NotReadableError" || error?.name === "AbortError") {
        setVoiceStatus("Mikrofon başka bir uygulama tarafından kullanılıyor veya Windows erişimi engelliyor.", "error");
      } else {
        setVoiceStatus("Mikrofon açılamadı. Mikrofon bağlantısını kontrol edip tekrar dene.", "error");
      }
      return;
    } finally {
      microphoneRequestInProgress = false;
    }

    // The user may have stopped voice chat while the permission dialog was open.
    if (!voiceEnabled) return;

    if (!recognition && !setupRecognition()) {
      voiceEnabled = false;
      updateButtons();
      return;
    }

    setVoiceStatus("Konuşma tanıma başlatılıyor…", "listening");
    startRecognition();
  }

  function stopVoiceChat() {
    voiceEnabled = false;
    recognitionError = false;
    waitingForReply = false;

    clearRestartTimer();
    stopSpeech();

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
   * Yalnızca /api/chat yanıtlarını yakalar.
   * Araştırma ve diğer API isteklerine müdahale etmez.
   */
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    let requestUrl;

    try {
      requestUrl =
        args[0] instanceof Request ? args[0].url : String(args[0]);
    } catch {
      return originalFetch(...args);
    }

    let isChatRequest = false;

    try {
      const url = new URL(requestUrl, window.location.href);
      isChatRequest = url.pathname.endsWith("/api/chat");
    } catch {
      isChatRequest = false;
    }

    let response;

    try {
      response = await originalFetch(...args);
    } catch (error) {
      if (isChatRequest && voiceEnabled) {
        waitingForReply = false;
        setVoiceStatus(
          "Bağlantı kurulamadı. Tekrar deneyebilirsin.",
          "error"
        );
        scheduleRecognitionRestart(900);
      }

      throw error;
    }

    if (!isChatRequest || !voiceEnabled) return response;

    try {
      const data = await response.clone().json();

      const reply =
        typeof data?.reply === "string"
          ? data.reply
          : typeof data?.text === "string"
            ? data.text
            : typeof data?.message === "string"
              ? data.message
              : "";

      if (response.ok && reply.trim()) {
        speakReply(reply);
      } else {
        waitingForReply = false;
        setVoiceStatus(
          data?.error || "NOVA yanıt veremedi. Tekrar konuşabilirsin.",
          "error"
        );
        scheduleRecognitionRestart(900);
      }
    } catch (error) {
      console.warn("NOVA Voice: Yanıt işlenemedi.", error);
      waitingForReply = false;
      speaking = false;
      setVoiceStatus("Yanıt okunamadı. Tekrar deneyebilirsin.", "error");
      scheduleRecognitionRestart(900);
    }

    return response;
  };

  const microphoneAccessStatus = $("microphoneAccessStatus");
  const microphoneTestButton = $("microphoneTest");
  const speechServiceStatus = $("speechServiceStatus");
  const speechServiceTestButton = $("speechServiceTest");

  async function refreshMicrophonePermissionStatus() {
    if (!microphoneAccessStatus) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      microphoneAccessStatus.textContent = "Bu tarayıcı mikrofon erişimini desteklemiyor.";
      return;
    }
    try {
      const permission = await navigator.permissions?.query?.({ name: "microphone" });
      if (permission?.state === "granted") microphoneAccessStatus.textContent = "İzin verildi · mikrofon erişilebilir.";
      else if (permission?.state === "denied") microphoneAccessStatus.textContent = "İzin engellendi · tarayıcı site izinlerini kontrol et.";
      else microphoneAccessStatus.textContent = "İzin henüz verilmedi veya ilk kullanım bekleniyor.";
    } catch {
      microphoneAccessStatus.textContent = "Mikrofon izni, ilk test sırasında kontrol edilecek.";
    }
  }

  microphoneTestButton?.addEventListener("click", async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      if (microphoneAccessStatus) microphoneAccessStatus.textContent = "Bu ortam mikrofon erişimini desteklemiyor.";
      return;
    }
    microphoneTestButton.disabled = true;
    if (microphoneAccessStatus) microphoneAccessStatus.textContent = "Mikrofon erişimi deneniyor…";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      const tracks = stream.getAudioTracks();
      const deviceName = tracks[0]?.label;
      tracks.forEach((track) => track.stop());
      if (microphoneAccessStatus) {
        microphoneAccessStatus.textContent = deviceName
          ? "Mikrofon çalışıyor · " + deviceName
          : "Mikrofon izni verildi ve erişim başarılı.";
      }
    } catch (error) {
      const message = error?.name === "NotAllowedError" || error?.name === "SecurityError"
        ? "Mikrofon izni reddedildi. Tarayıcı site izinlerinden NOVA'ya izin ver."
        : error?.name === "NotFoundError"
          ? "Kullanılabilir mikrofon bulunamadı."
          : "Mikrofon açılamadı. Bağlantıyı ve Windows mikrofon gizlilik ayarlarını kontrol et.";
      if (microphoneAccessStatus) microphoneAccessStatus.textContent = message;
    } finally {
      microphoneTestButton.disabled = false;
      refreshMicrophonePermissionStatus();
    }
  });

  speechServiceTestButton?.addEventListener("click", () => {
    if (!SpeechRecognition) {
      if (speechServiceStatus) speechServiceStatus.textContent = "Bu tarayıcı konuşma tanımayı desteklemiyor. Chrome veya Edge kullan.";
      return;
    }
    const testRecognition = new SpeechRecognition();
    let finished = false;
    let started = false;
    let timer = null;
    const finish = (message) => {
      if (finished) return;
      finished = true;
      if (timer) window.clearTimeout(timer);
      try { testRecognition.stop(); } catch {}
      if (speechServiceStatus) speechServiceStatus.textContent = message;
      speechServiceTestButton.disabled = false;
    };
    speechServiceTestButton.disabled = true;
    if (speechServiceStatus) speechServiceStatus.textContent = "Konuşma tanıma servisine bağlanılıyor…";
    testRecognition.lang = "tr-TR";
    testRecognition.continuous = false;
    testRecognition.interimResults = false;
    testRecognition.onstart = () => {
      started = true;
      if (speechServiceStatus) speechServiceStatus.textContent = "Servise bağlandı · şimdi kısa bir şey söyleyebilirsin.";
    };
    testRecognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      finish(transcript ? "Bağlantı başarılı · algılanan: “" + transcript + "”" : "Servis yanıt verdi; konuşma algılanamadı.");
    };
    testRecognition.onerror = (event) => {
      const message = event.error === "network"
        ? "Konuşma tanıma servisine ağ üzerinden bağlanılamadı. Mikrofon izni olsa bile bu ayrı bir servis hatasıdır."
        : event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Konuşma tanıma veya mikrofon izni engellendi."
          : event.error === "audio-capture"
            ? "Mikrofon yakalanamadı."
            : "Konuşma tanıma testi başarısız: " + event.error;
      finish(message);
    };
    testRecognition.onend = () => {
      if (!finished && started) finish("Servis bağlantısı kuruldu. Test sona erdi.");
      else if (!finished) finish("Konuşma tanıma servisi başlatılamadı.");
    };
    timer = window.setTimeout(() => finish(started
      ? "Servise bağlandı; test süresi doldu."
      : "Servise zamanında bağlanılamadı."), 8000);
    try { testRecognition.start(); }
    catch (error) { finish("Test başlatılamadı: " + (error?.message || "bilinmeyen hata")); }
  });

  refreshMicrophonePermissionStatus();

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

    stopSpeech();
  });

  function handleReplyFailure(message) {
    if (!voiceEnabled || !waitingForReply) return;

    waitingForReply = false;
    speaking = false;
    setVoiceStatus(message || "NOVA yanıt veremedi. Tekrar konuşabilirsin.", "error");
    scheduleRecognitionRestart(900);
  }

  window.NOVAVoice = Object.freeze({
    start: startVoiceChat,
    stop: stopVoiceChat,
    speak: (text) => speakReply(text),
    replyFailed: handleReplyFailure,
    get active() {
      return voiceEnabled;
    }
  });

  console.info("NOVA Voice: Ücretsiz tarayıcı sesi yüklendi.");
})();
