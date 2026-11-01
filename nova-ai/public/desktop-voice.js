"use strict";

/*
 * NOVA AI — Yerel Türkçe sesli sohbet
 * Konuşma tanıma tarayıcı/masaüstü cihazında Whisper ile çalışır.
 * Mikrofon sesi bir STT sunucusuna gönderilmez.
 */
(() => {
  if (!window.novaDesktop?.isDesktop) return;

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

  const MODEL_ID = "onnx-community/whisper-base";
  const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2";
  const TARGET_SAMPLE_RATE = 16000;
  const SILENCE_END_MS = 780;
  const MIN_SPEECH_MS = 350;
  const MAX_SPEECH_MS = 18000;
  const SPEECH_THRESHOLD = 0.012;
  const INTERRUPT_THRESHOLD = 0.028;
  const MIN_ACTIVE_SPEECH_MS = 500;
  const PRE_ROLL_CHUNKS = 3;

  const synth = window.speechSynthesis;
  const voiceChoice = $("voiceChoice");
  const voiceRate = $("voiceRate");
  const voiceRateValue = $("voiceRateValue");
  const voiceTestButton = $("voiceTest");
  const voiceSettingsStatus = $("voiceSettingsStatus");
  const microphoneAccessStatus = $("microphoneAccessStatus");
  const microphoneTestButton = $("microphoneTest");
  const speechServiceStatus = $("speechServiceStatus");
  const speechServiceTestButton = $("speechServiceTest");

  const VOICE_URI_KEY = "nova-ai-voice-uri";
  const VOICE_RATE_KEY = "nova-ai-voice-rate";

  let voiceEnabled = false;
  let waitingForReply = false;
  let speaking = false;
  let transcribing = false;
  let microphoneRequestInProgress = false;
  let microphoneStream = null;
  let audioContext = null;
  let audioSource = null;
  let audioProcessor = null;
  let silentGain = null;
  let transcriberPromise = null;
  let transcriber = null;
  let speechRequest = 0;
  let selectedVoice = null;
  let sessionId = 0;
  let capturingSpeech = false;
  let speechChunks = [];
  let preRoll = [];
  let silenceSamples = 0;
  let speechSamples = 0;
  let activeSpeechSamples = 0;
  let peakSpeechRms = 0;
  let noiseFloor = 0.002;
  let pendingTranscript = "";

  function setVoiceStatus(message, state = "idle") {
    statusLabel.textContent = message;
    statusLabel.dataset.state = state;
  }

  function updateButtons() {
    toggleButton.disabled = !navigator.mediaDevices?.getUserMedia;
    toggleButton.setAttribute("aria-pressed", String(voiceEnabled));
    toggleButton.classList.toggle("active", voiceEnabled);
    toggleButton.setAttribute(
      "aria-label",
      voiceEnabled ? "Sesli sohbeti kapat" : "Sesli sohbeti başlat"
    );
    if (toggleLabel) {
      toggleLabel.textContent = voiceEnabled ? "Sesli sohbet açık" : "Sesli sohbeti başlat";
    }
    stopButton.disabled = !voiceEnabled;
  }

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
      // Depolama kullanılamazsa sesli sohbet çalışmaya devam eder.
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
    return voices.find((voice) => voice.voiceURI === preferredUri)
      || voices.find((voice) => voice.localService)
      || voices[0]
      || null;
  }

  function getSpeechRate() {
    const value = Number(voiceRate?.value || readPreference(VOICE_RATE_KEY, "0.95"));
    return Number.isFinite(value) ? Math.min(1.15, Math.max(0.85, value)) : 0.95;
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
        option.textContent = voice.name + " · " + voice.lang + (voice.localService ? " · Bu cihazda" : "");
        voiceChoice.append(option);
      });
      voiceChoice.value = voices.some((voice) => voice.voiceURI === preferredUri)
        ? preferredUri
        : currentValue && voices.some((voice) => voice.voiceURI === currentValue) ? currentValue : "";
    }

    const savedRate = Number(readPreference(VOICE_RATE_KEY, "0.95"));
    const rate = Number.isFinite(savedRate) ? Math.min(1.15, Math.max(0.85, savedRate)) : 0.95;
    if (voiceRate && document.activeElement !== voiceRate) voiceRate.value = String(rate);
    if (voiceRateValue) voiceRateValue.textContent = Number(voiceRate?.value || rate).toFixed(2) + "×";
    if (voiceSettingsStatus) {
      voiceSettingsStatus.textContent = voices.length
        ? voices.length + " Türkçe ses bulundu."
        : "Türkçe ses bulunamadı. Windows Ayarları > Saat ve Dil > Dil ve Bölge bölümünden Türkçe konuşma sesini yükleyebilirsin.";
    }
  }

  if (synth) {
    updateVoiceSettings();
    synth.addEventListener?.("voiceschanged", updateVoiceSettings);
  }

  voiceChoice?.addEventListener("change", () => {
    savePreference(VOICE_URI_KEY, voiceChoice.value);
    selectedVoice = chooseTurkishVoice();
    if (voiceSettingsStatus) voiceSettingsStatus.textContent = voiceChoice.value
      ? "Seçtiğin ses kaydedildi."
      : "Otomatik Türkçe ses seçimi kullanılıyor.";
  });

  voiceRate?.addEventListener("input", () => {
    const rate = getSpeechRate();
    if (voiceRateValue) voiceRateValue.textContent = rate.toFixed(2) + "×";
    savePreference(VOICE_RATE_KEY, String(rate));
  });

  async function loadTranscriber() {
    if (transcriber) return transcriber;
    if (transcriberPromise) return transcriberPromise;

    transcriberPromise = (async () => {
      setVoiceStatus("Yerel Türkçe konuşma modeli yükleniyor… İlk kullanımda model indirilecek.", "loading");
      if (speechServiceStatus) speechServiceStatus.textContent = "Whisper modeli hazırlanıyor…";

      const transformers = await import(TRANSFORMERS_URL);
      transformers.env.useBrowserCache = true;
      transformers.env.useWasmCache = true;
      transformers.env.allowRemoteModels = true;

      const progress = (event) => {
        if (!voiceEnabled || !event) return;
        if (event.status === "progress" && Number.isFinite(event.progress)) {
          const percent = Math.max(0, Math.min(100, Math.round(event.progress)));
          setVoiceStatus("Türkçe model indiriliyor… %" + percent, "loading");
          if (speechServiceStatus) speechServiceStatus.textContent = "Model indiriliyor: %" + percent;
        } else if (event.status === "done" && event.file) {
          if (speechServiceStatus) speechServiceStatus.textContent = "Model dosyası hazır: " + event.file;
        }
      };

      if (navigator.gpu) {
        try {
          const gpuPipeline = await transformers.pipeline(
            "automatic-speech-recognition",
            MODEL_ID,
            {
              device: "webgpu",
              dtype: "fp16",
              progress_callback: progress
            }
          );
          if (speechServiceStatus) speechServiceStatus.textContent = "Yerel Türkçe konuşma modeli hazır · GPU";
          return gpuPipeline;
        } catch (gpuError) {
          console.warn("NOVA Voice: WebGPU kullanılamadı, WASM deneniyor.", gpuError);
        }
      }

      const cpuPipeline = await transformers.pipeline(
        "automatic-speech-recognition",
        MODEL_ID,
        {
          device: "wasm",
          dtype: "q8",
          progress_callback: progress
        }
      );
      if (speechServiceStatus) speechServiceStatus.textContent = "Yerel Türkçe konuşma modeli hazır · CPU";
      return cpuPipeline;
    })();

    try {
      transcriber = await transcriberPromise;
      return transcriber;
    } catch (error) {
      transcriberPromise = null;
      throw error;
    }
  }

  function stopSpeech() {
    speechRequest += 1;
    if (synth) synth.cancel();
    speaking = false;
  }

  function speakReply(text) {
    const answer = String(text || "").trim().slice(0, 4000);
    if (!answer || !voiceEnabled) {
      waitingForReply = false;
      setVoiceStatus("Seni dinliyorum…", "listening");
      return;
    }
    if (!synth || !("SpeechSynthesisUtterance" in window)) {
      waitingForReply = false;
      setVoiceStatus("Bu cihazda seslendirme desteklenmiyor.", "error");
      return;
    }

    stopSpeech();
    const requestId = speechRequest;
    waitingForReply = false;
    speaking = true;
    selectedVoice = chooseTurkishVoice();

    const sentences = answer.match(/[^.!?…]+[.!?…]+["'”’)]*|[^.!?…]+$/g) || [answer];
    const queue = [];
    let pending = "";
    sentences.forEach((sentence) => {
      const part = sentence.trim();
      if (!part) return;
      if (pending && pending.length + part.length + 1 > 240) {
        queue.push(pending);
        pending = part;
      } else {
        pending = pending ? pending + " " + part : part;
      }
    });
    if (pending) queue.push(pending);

    let index = 0;
    const speakNext = () => {
      if (requestId !== speechRequest || !voiceEnabled) return;
      if (index >= queue.length) {
        speaking = false;
        setVoiceStatus("Seni dinliyorum…", "listening");
        return;
      }
      const utterance = new SpeechSynthesisUtterance(queue[index++]);
      utterance.lang = "tr-TR";
      utterance.rate = getSpeechRate();
      utterance.pitch = 1;
      utterance.volume = 1;
      if (selectedVoice) utterance.voice = selectedVoice;
      utterance.onstart = () => {
        if (requestId === speechRequest && voiceEnabled) setVoiceStatus("NOVA konuşuyor… Sözünü kesebilirsin.", "speaking");
      };
      utterance.onend = speakNext;
      utterance.onerror = (event) => {
        if (requestId !== speechRequest) return;
        console.warn("NOVA Voice: Ses parçası okunamadı.", event.error);
        speakNext();
      };
      synth.speak(utterance);
    };

    setVoiceStatus("NOVA yanıtını seslendiriyor…", "speaking");
    speakNext();
  }

  function resampleTo16k(inputSamples, sourceRate) {
    if (sourceRate === TARGET_SAMPLE_RATE) return inputSamples;
    const outputLength = Math.max(1, Math.floor(inputSamples.length * TARGET_SAMPLE_RATE / sourceRate));
    const output = new Float32Array(outputLength);
    const ratio = sourceRate / TARGET_SAMPLE_RATE;
    for (let i = 0; i < outputLength; i += 1) {
      const position = i * ratio;
      const left = Math.floor(position);
      const right = Math.min(left + 1, inputSamples.length - 1);
      const fraction = position - left;
      output[i] = inputSamples[left] * (1 - fraction) + inputSamples[right] * fraction;
    }
    return output;
  }

  function joinChunks(chunks) {
    const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Float32Array(length);
    let offset = 0;
    chunks.forEach((chunk) => {
      result.set(chunk, offset);
      offset += chunk.length;
    });
    return result;
  }

  function submitTranscript(text) {
    if (!voiceEnabled || !text) return;
    if (window.NOVAApp?.busy) {
      pendingTranscript = text;
      window.NOVAApp.interruptCurrentResponse?.();
      setVoiceStatus("Sözünü alıyorum… mevcut yanıt durduruluyor.", "listening");
      return;
    }

    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    waitingForReply = true;
    setVoiceStatus("Söylediklerin NOVA'ya gönderiliyor…", "speaking");
    if (typeof form.requestSubmit === "function") form.requestSubmit();
    else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }

  function onSpeechStart() {
    if (speaking) {
      stopSpeech();
      setVoiceStatus("Sözünü alıyorum…", "listening");
    } else if (waitingForReply) {
      window.NOVAApp?.interruptCurrentResponse?.();
      waitingForReply = false;
      setVoiceStatus("Sözünü alıyorum… mevcut yanıt durduruluyor.", "listening");
    }
  }

  async function transcribeSegment(chunks, currentSession) {
    if (!voiceEnabled || transcribing || currentSession !== sessionId) return;
    const sampleCount = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const minimumSamples = Math.floor((audioContext?.sampleRate || TARGET_SAMPLE_RATE) * MIN_SPEECH_MS / 1000);
    if (sampleCount < minimumSamples) return;

    transcribing = true;
    setVoiceStatus("Konuşman cihazında çözümleniyor…", "processing");
    try {
      const rawAudio = joinChunks(chunks);
      const audio16k = resampleTo16k(rawAudio, audioContext?.sampleRate || TARGET_SAMPLE_RATE);
      const model = await loadTranscriber();
      if (!voiceEnabled || currentSession !== sessionId) return;
      const result = await model(audio16k, { language: "turkish", task: "transcribe" });
      if (!voiceEnabled || currentSession !== sessionId) return;
      const transcript = String(result?.text || "").trim().replace(/^\s+|\s+$/g, "");
      if (transcript.length >= 2) {
        submitTranscript(transcript);
      } else {
        setVoiceStatus("Konuşmanı net duyamadım. Seni dinliyorum…", "listening");
      }
    } catch (error) {
      console.error("NOVA Voice: Yerel konuşma tanıma başarısız.", error);
      setVoiceStatus("Yerel konuşma tanıma başlatılamadı. Model bağlantısını ve cihaz uyumluluğunu kontrol et.", "error");
      if (speechServiceStatus) speechServiceStatus.textContent = error?.message || "Model yüklenemedi.";
    } finally {
      transcribing = false;
      if (voiceEnabled && currentSession === sessionId && !waitingForReply && !speaking) {
        setVoiceStatus("Seni dinliyorum…", "listening");
      }
    }
  }

  function finishSpeechSegment(currentSession) {
    if (!capturingSpeech) return;
    capturingSpeech = false;
    const chunks = speechChunks;
    speechChunks = [];
    const durationMs = speechSamples * 1000 / (audioContext?.sampleRate || TARGET_SAMPLE_RATE);
    speechSamples = 0;
    silenceSamples = 0;
    const activeSpeechMs = activeSpeechSamples * 1000 / (audioContext?.sampleRate || TARGET_SAMPLE_RATE);
    const validVoiceActivity = activeSpeechMs >= MIN_ACTIVE_SPEECH_MS && peakSpeechRms >= SPEECH_THRESHOLD * 1.5;
    activeSpeechSamples = 0;
    peakSpeechRms = 0;
    if (durationMs >= MIN_SPEECH_MS && validVoiceActivity) {
      transcribeSegment(chunks, currentSession);
    } else if (voiceEnabled) {
      setVoiceStatus("Seni dinliyorum…", "listening");
    }
  }

  function handleAudioFrame(frame, currentSession) {
    if (!voiceEnabled || currentSession !== sessionId || transcribing) return;
    const copy = new Float32Array(frame);
    let energy = 0;
    for (let i = 0; i < copy.length; i += 1) energy += copy[i] * copy[i];
    const rms = Math.sqrt(energy / Math.max(1, copy.length));
    const sampleRate = audioContext?.sampleRate || TARGET_SAMPLE_RATE;
    // NOVA'nın kendi yanıtı sırasında yankı/TV sesi yanlışlıkla yeni komut
    // başlatmasın. Kullanıcı araya girebilir; ancak daha güçlü ve uzun ses gerekir.
    const interrupting = speaking || waitingForReply;
    const threshold = Math.max(
      interrupting ? INTERRUPT_THRESHOLD : SPEECH_THRESHOLD,
      noiseFloor * (interrupting ? 4.5 : 3.5)
    );

    if (rms >= threshold) {
      if (!capturingSpeech) {
        capturingSpeech = true;
        speechChunks = preRoll.slice();
        speechSamples = speechChunks.reduce((sum, chunk) => sum + chunk.length, 0);
        activeSpeechSamples = 0;
        peakSpeechRms = 0;
        silenceSamples = 0;
        onSpeechStart();
      }
      speechChunks.push(copy);
      speechSamples += copy.length;
      activeSpeechSamples += copy.length;
      peakSpeechRms = Math.max(peakSpeechRms, rms);
      silenceSamples = 0;
    } else if (capturingSpeech) {
      speechChunks.push(copy);
      speechSamples += copy.length;
      silenceSamples += copy.length;
    } else {
      noiseFloor = noiseFloor * 0.96 + rms * 0.04;
      preRoll.push(copy);
      while (preRoll.length > PRE_ROLL_CHUNKS) preRoll.shift();
    }

    if (capturingSpeech) {
      if (silenceSamples >= sampleRate * SILENCE_END_MS / 1000) {
        finishSpeechSegment(currentSession);
      } else if (speechSamples >= sampleRate * MAX_SPEECH_MS / 1000) {
        finishSpeechSegment(currentSession);
      }
    }
  }

  async function startAudioCapture(currentSession) {
    audioContext = new AudioContext();
    await audioContext.resume();
    audioSource = audioContext.createMediaStreamSource(microphoneStream);
    audioProcessor = audioContext.createScriptProcessor(4096, 1, 1);
    silentGain = audioContext.createGain();
    silentGain.gain.value = 0;
    audioProcessor.onaudioprocess = (event) => {
      handleAudioFrame(event.inputBuffer.getChannelData(0), currentSession);
    };
    audioSource.connect(audioProcessor);
    audioProcessor.connect(silentGain);
    silentGain.connect(audioContext.destination);
  }

  async function startVoiceChat() {
    if (microphoneRequestInProgress || voiceEnabled) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceStatus("Bu ortam mikrofon erişimini desteklemiyor.", "error");
      return;
    }

    microphoneRequestInProgress = true;
    voiceEnabled = true;
    waitingForReply = false;
    pendingTranscript = "";
    sessionId += 1;
    const currentSession = sessionId;
    updateButtons();
    setVoiceStatus("Mikrofon izni isteniyor…", "loading");

    try {
      microphoneStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      if (!voiceEnabled || currentSession !== sessionId) {
        microphoneStream.getTracks().forEach((track) => track.stop());
        microphoneStream = null;
        return;
      }
      const track = microphoneStream.getAudioTracks()[0];
      if (microphoneAccessStatus) microphoneAccessStatus.textContent =
        track?.label ? "Mikrofon çalışıyor · " + track.label : "Mikrofon erişimi başarılı.";

      await loadTranscriber();
      if (!voiceEnabled || currentSession !== sessionId) return;
      await startAudioCapture(currentSession);
      if (!voiceEnabled || currentSession !== sessionId) return;
      setVoiceStatus("Seni dinliyorum…", "listening");
    } catch (error) {
      console.error("NOVA Voice: Başlatma başarısız.", error);
      voiceEnabled = false;
      stopAudioResources();
      updateButtons();
      const message = error?.name === "NotAllowedError" || error?.name === "SecurityError"
        ? "Mikrofon izni verilmedi. Tarayıcı veya Windows ayarlarından NOVA'ya izin ver."
        : error?.name === "NotFoundError"
          ? "Kullanılabilir mikrofon bulunamadı."
          : "Sesli sohbet başlatılamadı: " + (error?.message || "bilinmeyen hata");
      setVoiceStatus(message, "error");
    } finally {
      microphoneRequestInProgress = false;
    }
  }

  function stopAudioResources() {
    if (audioProcessor) {
      audioProcessor.onaudioprocess = null;
      try { audioProcessor.disconnect(); } catch {}
      audioProcessor = null;
    }
    if (audioSource) {
      try { audioSource.disconnect(); } catch {}
      audioSource = null;
    }
    if (silentGain) {
      try { silentGain.disconnect(); } catch {}
      silentGain = null;
    }
    if (microphoneStream) {
      microphoneStream.getTracks().forEach((track) => track.stop());
      microphoneStream = null;
    }
    if (audioContext) {
      const context = audioContext;
      audioContext = null;
      context.close().catch(() => {});
    }
    preRoll = [];
    speechChunks = [];
    capturingSpeech = false;
    silenceSamples = 0;
    speechSamples = 0;
    activeSpeechSamples = 0;
    peakSpeechRms = 0;
  }

  function stopVoiceChat() {
    voiceEnabled = false;
    waitingForReply = false;
    pendingTranscript = "";
    sessionId += 1;
    stopSpeech();
    stopAudioResources();
    updateButtons();
    setVoiceStatus("Sesli sohbet kapalı", "idle");
  }

  window.addEventListener("nova:chat-idle", () => {
    if (!voiceEnabled || !pendingTranscript) return;
    const transcript = pendingTranscript;
    pendingTranscript = "";
    submitTranscript(transcript);
  });

  toggleButton.addEventListener("click", () => {
    if (voiceEnabled) stopVoiceChat();
    else startVoiceChat();
  });
  stopButton.addEventListener("click", stopVoiceChat);

  voiceTestButton?.addEventListener("click", () => {
    if (!synth || !("SpeechSynthesisUtterance" in window)) {
      if (voiceSettingsStatus) voiceSettingsStatus.textContent = "Bu cihazda seslendirme desteklenmiyor.";
      return;
    }
    const preview = new SpeechSynthesisUtterance("Merhaba, ben NOVA. Bugün sana nasıl yardımcı olabilirim?");
    preview.lang = "tr-TR";
    preview.rate = getSpeechRate();
    selectedVoice = chooseTurkishVoice();
    if (selectedVoice) preview.voice = selectedVoice;
    preview.onend = () => {
      if (voiceSettingsStatus) voiceSettingsStatus.textContent = "Ses denemesi tamamlandı.";
    };
    preview.onerror = () => {
      if (voiceSettingsStatus) voiceSettingsStatus.textContent = "Ses denemesi başarısız oldu.";
    };
    if (voiceSettingsStatus) voiceSettingsStatus.textContent = "NOVA'nın sesi deneniyor…";
    synth.cancel();
    synth.speak(preview);
  });

  microphoneTestButton?.addEventListener("click", async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      if (microphoneAccessStatus) microphoneAccessStatus.textContent = "Mikrofon erişimi desteklenmiyor.";
      return;
    }
    microphoneTestButton.disabled = true;
    if (microphoneAccessStatus) microphoneAccessStatus.textContent = "Mikrofon erişimi deneniyor…";
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const label = stream.getAudioTracks()[0]?.label;
      if (microphoneAccessStatus) microphoneAccessStatus.textContent = label
        ? "Mikrofon çalışıyor · " + label
        : "Mikrofon erişimi başarılı.";
    } catch (error) {
      if (microphoneAccessStatus) microphoneAccessStatus.textContent =
        error?.name === "NotAllowedError" ? "Mikrofon izni reddedildi."
          : error?.name === "NotFoundError" ? "Mikrofon bulunamadı."
            : "Mikrofon testi başarısız: " + (error?.message || "bilinmeyen hata");
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      microphoneTestButton.disabled = false;
    }
  });

  speechServiceTestButton?.addEventListener("click", async () => {
    speechServiceTestButton.disabled = true;
    if (speechServiceStatus) speechServiceStatus.textContent = "Yerel Türkçe model kontrol ediliyor…";
    try {
      await loadTranscriber();
      if (speechServiceStatus) speechServiceStatus.textContent = "Yerel Whisper modeli hazır. Mikrofon sesi cihazında çözümlenecek.";
    } catch (error) {
      if (speechServiceStatus) speechServiceStatus.textContent = "Model yüklenemedi: " + (error?.message || "bilinmeyen hata");
    } finally {
      speechServiceTestButton.disabled = false;
    }
  });

  window.addEventListener("beforeunload", () => {
    stopVoiceChat();
  });

  window.NOVAVoice = Object.freeze({
    start: startVoiceChat,
    stop: stopVoiceChat,
    speak: speakReply,
    replyFailed(message) {
      waitingForReply = false;
      speaking = false;
      if (voiceEnabled) setVoiceStatus(message || "NOVA yanıt veremedi. Tekrar konuşabilirsin.", "error");
    },
    get active() {
      return voiceEnabled;
    }
  });

  updateButtons();
  console.info("NOVA Voice: Yerel Whisper sesli sohbeti yüklendi.");
})();
