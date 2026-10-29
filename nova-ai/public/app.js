(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);

  const form = $("#form");
  const prompt = $("#prompt");
  const messagesEl = $("#messages");
  const sendButton = $("#send");
  const historyEl = $("#history");
  const newChatButton = $("#newChat");
  const researchButton = $("#research");
  const menuButton = $("#menu");
  const scrim = $("#scrim");
  const layout = $("#layout");

  const authScreen = $("#authScreen");
  const authForm = $("#authForm");
  const authEmail = $("#authEmail");
  const authPassword = $("#authPassword");
  const authMessage = $("#authMessage");
  const authSubmit = $("#authSubmit");
  const loginTab = $("#loginTab");
  const registerTab = $("#registerTab");
  const authTitle = $("#authTitle");
  const authDescription = $("#authDescription");
  const logoutButton = $("#logoutButton");
  const profileEmail = $("#profileEmail");
  const profileName = $("#profileName");

  if (!form || !prompt || !messagesEl) {
    console.error("NOVA AI: Sohbet arayüzü bulunamadı.");
    return;
  }

  const SUPABASE_URL =
    "https://rjwjgopzrjnpjwhdccqs.supabase.co";

  const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_qjORMs4iC1ZQ72FmpnSWnA_ciB6adJu";

  if (!window.supabase?.createClient) {
    console.error("Supabase istemcisi yüklenemedi.");

    if (authMessage) {
      authMessage.textContent =
        "Bağlantı kütüphanesi yüklenemedi. Sayfayı yenile.";
    }

    return;
  }

  if (
    !SUPABASE_PUBLISHABLE_KEY ||
    SUPABASE_PUBLISHABLE_KEY === "BURAYA_SUPABASE_PUBLISHABLE_KEY"
  ) {
    console.error("Supabase Publishable key ayarlanmadı.");

    if (authMessage) {
      authMessage.textContent =
        "Supabase Publishable key değerini app.js içine ekle.";
    }

    return;
  }

  const supabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );

  const NOVA_ICON = "/nova-icon.png";

  let conversations = [];
  let currentId = null;
  let busy = false;
  let researchMode = false;
  let currentUser = null;
  let authMode = "login";

  function createId() {
    return crypto.randomUUID();
  }

  function currentConversation() {
    return conversations.find((item) => item.id === currentId);
  }

  function sortConversations() {
    conversations.sort(
      (a, b) =>
        (Number(b.updatedAt) || 0) -
        (Number(a.updatedAt) || 0)
    );
  }

  function createNovaAvatar(className = "message-avatar") {
    const avatar = document.createElement("div");
    avatar.className = className;
    avatar.setAttribute("aria-hidden", "true");

    const image = document.createElement("img");
    image.src = NOVA_ICON;
    image.alt = "";
    image.className = "nova-avatar-image";

    image.addEventListener(
      "error",
      () => {
        image.remove();
        avatar.textContent = "✦";
      },
      { once: true }
    );

    avatar.appendChild(image);
    return avatar;
  }

  function closeMenu() {
    document.body.classList.remove("menu-open");
    layout?.classList.remove("sidebar-open");
    menuButton?.setAttribute("aria-expanded", "false");
  }

  function setAuthenticatedUI(isAuthenticated) {
    if (authScreen) {
      authScreen.hidden = isAuthenticated;
    }

    document.body.classList.toggle(
      "authenticated",
      isAuthenticated
    );

    if (profileName) {
      profileName.textContent = currentUser
        ? currentUser.user_metadata?.name || "NOVA AI"
        : "NOVA AI";
    }

    if (profileEmail) {
      profileEmail.textContent =
        currentUser?.email || "Kişisel asistanın";
    }
  }

  function setAuthMode(mode) {
    authMode = mode;

    const isLogin = mode === "login";

    loginTab?.classList.toggle("active", isLogin);
    registerTab?.classList.toggle("active", !isLogin);

    if (authTitle) {
      authTitle.textContent = isLogin
        ? "Tekrar hoş geldin"
        : "NOVA AI'ye katıl";
    }

    if (authDescription) {
      authDescription.textContent = isLogin
        ? "Hesabına giriş yap ve sohbetlerine devam et."
        : "Yeni hesabını oluştur ve NOVA AI ile tanış.";
    }

    if (authSubmit) {
      authSubmit.textContent = isLogin
        ? "Giriş yap"
        : "Hesap oluştur";
    }

    if (authPassword) {
      authPassword.autocomplete = isLogin
        ? "current-password"
        : "new-password";
    }

    if (authMessage) {
      authMessage.textContent = "";
    }
  }

  loginTab?.addEventListener("click", () => {
    setAuthMode("login");
  });

  registerTab?.addEventListener("click", () => {
    setAuthMode("register");
  });

  // Giriş ve kayıt
  authForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = authEmail.value.trim();
    const password = authPassword.value;

    if (!email || !password) return;

    if (authSubmit) {
      authSubmit.disabled = true;
      authSubmit.textContent = "İşleniyor...";
    }

    if (authMessage) {
      authMessage.textContent = "";
    }

    try {
      if (authMode === "register") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password
        });

        if (error) throw error;

        if (data.session) {
          currentUser = data.user;
          await initializeApp();
        } else if (authMessage) {
          authMessage.textContent =
            "Kayıt isteği gönderildi. E-posta doğrulaması " +
            "isteniyorsa gelen kutunu kontrol et; ardından giriş yap.";
        }
      } else {
        const { data, error } =
          await supabase.auth.signInWithPassword({
            email,
            password
          });

        if (error) throw error;

        currentUser = data.user;
        await initializeApp();
      }
    } catch (error) {
      console.error("NOVA AI hesap hatası:", error);

      if (authMessage) {
        authMessage.textContent =
          error.message || "İşlem başarısız oldu.";
      }
    } finally {
      if (authSubmit) {
        authSubmit.disabled = false;
        authSubmit.textContent =
          authMode === "login"
            ? "Giriş yap"
            : "Hesap oluştur";
      }
    }
  });

  // Hesaptan çıkış
  logoutButton?.addEventListener("click", async () => {
    if (busy) return;

    try {
      const { error } = await supabase.auth.signOut();

      if (error) throw error;

      currentUser = null;
      conversations = [];
      currentId = null;

      setAuthenticatedUI(false);

      if (authMessage) {
        authMessage.textContent = "";
      }

      if (authPassword) {
        authPassword.value = "";
      }

      setAuthMode("login");
      renderHistory();
      renderMessages();
    } catch (error) {
      console.error("Çıkış yapılamadı:", error);
      alert("Çıkış yapılamadı: " + error.message);
    }
  });

  // Sohbet geçmişini yükle
  async function loadConversations() {
    if (!currentUser) {
      conversations = [];
      currentId = null;
      renderHistory();
      renderMessages();
      return;
    }

    const { data, error } = await supabase
      .from("conversations")
      .select("id, title, messages, created_at, updated_at")
      .order("updated_at", { ascending: false });

    if (error) throw error;

    conversations = (data || []).map((row) => ({
      id: row.id,
      title: row.title || "Yeni sohbet",
      messages: Array.isArray(row.messages)
        ? row.messages
        : [],
      updatedAt: Date.parse(row.updated_at) || Date.now()
    }));

    currentId = conversations[0]?.id || null;

    renderHistory();
    renderMessages();
  }

  // Sohbeti Supabase'e kaydet
  async function persistConversation(conversation) {
    if (!currentUser) {
      throw new Error("Önce giriş yapmalısın.");
    }

    const payload = {
      user_id: currentUser.id,
      title: conversation.title || "Yeni sohbet",
      messages: conversation.messages,
      updated_at: new Date(
        conversation.updatedAt || Date.now()
      ).toISOString()
    };

    if (conversation._isNew) {
      const temporaryId = conversation.id;

      const { data, error } = await supabase
        .from("conversations")
        .insert(payload)
        .select("id")
        .single();

      if (error) throw error;

      conversation.id = data.id;
      delete conversation._isNew;

      if (currentId === temporaryId) {
        currentId = data.id;
      }
    } else {
      const { error } = await supabase
        .from("conversations")
        .update(payload)
        .eq("id", conversation.id)
        .eq("user_id", currentUser.id);

      if (error) throw error;
    }
  }

  async function save(conversation = currentConversation()) {
    if (!conversation || !currentUser) return;
    await persistConversation(conversation);
  }

  // Yeni sohbet oluştur
  async function newChat() {
    if (!currentUser || busy) return;

    const conversation = {
      id: createId(),
      title: "Yeni sohbet",
      messages: [],
      updatedAt: Date.now(),
      _isNew: true
    };

    conversations.unshift(conversation);
    currentId = conversation.id;

    sortConversations();
    renderMessages();
    renderHistory();
    closeMenu();

    prompt.focus();
  }

  // Sohbet yoksa oluştur
  async function ensureConversation() {
    let conversation = currentConversation();

    if (!conversation) {
      conversation = {
        id: createId(),
        title: "Yeni sohbet",
        messages: [],
        updatedAt: Date.now(),
        _isNew: true
      };

      conversations.unshift(conversation);
      currentId = conversation.id;

      sortConversations();
      renderHistory();
      renderMessages();
    }

    if (conversation._isNew) {
      await save(conversation);
    }

    return conversation;
  }

  // Sohbet silme
  async function deleteConversation(conversationId) {
    const conversation = conversations.find(
      (item) => item.id === conversationId
    );

    if (!conversation) return;

    if (
      !window.confirm(
        `"${conversation.title || "Yeni sohbet"}" ` +
        "sohbetini silmek istiyor musun?"
      )
    ) {
      return;
    }

    try {
      if (!conversation._isNew) {
        const { error } = await supabase
          .from("conversations")
          .delete()
          .eq("id", conversationId)
          .eq("user_id", currentUser.id);

        if (error) throw error;
      }

      conversations = conversations.filter(
        (item) => item.id !== conversationId
      );

      if (currentId === conversationId) {
        currentId = conversations[0]?.id || null;
      }

      renderHistory();
      renderMessages();
    } catch (error) {
      console.error("Sohbet silinemedi:", error);
      alert("Sohbet silinemedi: " + error.message);
    }
  }

  // Sohbet geçmişini göster
  function renderHistory() {
    if (!historyEl) return;

    sortConversations();
    historyEl.replaceChildren();

    conversations.forEach((conversation) => {
      const row = document.createElement("div");
      row.className = "history-row";

      if (conversation.id === currentId) {
        row.classList.add("active");
      }

      const button = document.createElement("button");
      button.type = "button";
      button.className = "history-item";
      button.setAttribute("role", "listitem");
      button.textContent =
        conversation.title || "Yeni sohbet";

      button.addEventListener("click", () => {
        if (busy) return;

        currentId = conversation.id;

        renderHistory();
        renderMessages();
        closeMenu();
      });

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "history-delete";
      deleteButton.textContent = "×";
      deleteButton.title = "Sohbeti sil";
      deleteButton.setAttribute("aria-label", "Sohbeti sil");

      deleteButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        deleteConversation(conversation.id);
      });

      row.append(button, deleteButton);
      historyEl.appendChild(row);
    });

    const hint = $("#historyHint");

    if (hint) {
      hint.hidden = conversations.length > 0;
    }
  }

  // Mesajları ekrana çiz
  function renderMessages() {
    const conversation = currentConversation();

    messagesEl.replaceChildren();

    if (!conversation || !conversation.messages.length) {
      const welcome = document.createElement("div");
      welcome.className = "welcome";

      const heading = document.createElement("h1");
      heading.textContent = "Merhaba, ben NOVA AI.";

      const description = document.createElement("p");
      description.textContent =
        "Aklındaki soruları sor, fikirlerini geliştir veya " +
        "yeni bir şey keşfet. Sana nasıl yardımcı olabilirim?";

      welcome.append(
        createNovaAvatar("welcome-icon"),
        heading,
        description
      );

      messagesEl.appendChild(welcome);
      return;
    }

    conversation.messages.forEach((item) => {
      const isUser = item.role === "user";

      const wrapper = document.createElement("article");
      wrapper.className = isUser
        ? "message user-message user"
        : "message assistant-message assistant";

      let avatar;

      if (isUser) {
        avatar = document.createElement("div");
        avatar.className = "message-avatar";
        avatar.textContent = "S";
      } else {
        avatar = createNovaAvatar();
      }

      const main = document.createElement("div");
      main.className = "message-main";

      const name = document.createElement("div");
      name.className = "message-name";
      name.textContent = isUser ? "Sen" : "NOVA AI";

      const content = document.createElement("div");
      content.className = "message-content";
      if (item.type === "image" && item.imagePath) {
        content.textContent = item.content || "Oluşturulan resim";
        const savedImage = document.createElement("img");
        savedImage.alt = item.content || "NOVA AI tarafından oluşturulan resim";
        savedImage.style.cssText = "display:block;max-width:min(100%,640px);max-height:480px;object-fit:contain;margin-top:10px;border-radius:14px";
        const download = document.createElement("a");
        download.textContent = "Resmi indir";
        download.style.cssText = "display:inline-block;margin-top:10px";
        download.download = "nova-ai-resim.png";
        content.appendChild(document.createElement("br"));
        content.appendChild(savedImage);
        content.appendChild(document.createElement("br"));
        content.appendChild(download);
        supabase.storage.from("nova-ai-images").createSignedUrl(item.imagePath, 3600)
          .then(({ data, error }) => {
            if (error || !data?.signedUrl) {
              savedImage.alt = "Resim yüklenemedi. Tekrar giriş yapıp sohbeti yenile.";
              return;
            }
            savedImage.src = data.signedUrl;
            download.href = data.signedUrl;
          })
          .catch(error => console.error("Kayıtlı resim açılamadı:", error));
      } else {
        content.textContent =
          typeof item.content === "string"
            ? item.content
            : "";
      }

      main.append(name, content);

      if (!isUser) {
        const actions = document.createElement("div");
        actions.className = "message-actions";

        const copyButton = document.createElement("button");
        copyButton.type = "button";
        copyButton.textContent = "Kopyala";

        copyButton.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(
              content.textContent
            );

            copyButton.textContent = "Kopyalandı";

            setTimeout(() => {
              copyButton.textContent = "Kopyala";
            }, 1500);
          } catch {
            copyButton.textContent = "Kopyalanamadı";
          }
        });

        const speakButton = document.createElement("button");
        speakButton.type = "button";
        speakButton.textContent = "Seslendir";

        speakButton.addEventListener("click", async () => {
          try {
            await window.NOVA.speak(content.textContent);
          } catch (error) {
            alert("Ses oluşturulamadı: " + error.message);
          }
        });

        actions.append(copyButton, speakButton);
        main.appendChild(actions);
      }

      if (isUser) {
        wrapper.appendChild(main);
      } else {
        wrapper.append(avatar, main);
      }

      messagesEl.appendChild(wrapper);
    });

    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // Mesaj ekle ve kaydet
  async function addMessage(role, content) {
    const conversation = await ensureConversation();

    if (!conversation) {
      throw new Error(
        "Sohbet oluşturulamadı. Lütfen tekrar dene."
      );
    }

    conversation.messages.push({ role, content });
    conversation.updatedAt = Date.now();

    if (
      role === "user" &&
      conversation.title === "Yeni sohbet"
    ) {
      conversation.title = content.slice(0, 45);
    }

    await save(conversation);

    sortConversations();
    renderMessages();
    renderHistory();
  }

  function setBusy(value) {
    busy = value;
    prompt.disabled = value;

    if (sendButton) {
      sendButton.disabled = value;
      sendButton.classList.toggle("is-busy", value);
    }

    form.setAttribute("aria-busy", String(value));
  }

  // Akış yanıtı için mesaj alanı
  function createStreamingMessage() {
    const wrapper = document.createElement("article");
    wrapper.className =
      "message assistant-message assistant loading";

    const main = document.createElement("div");
    main.className = "message-main";

    const name = document.createElement("div");
    name.className = "message-name";
    name.textContent = "NOVA AI";

    const content = document.createElement("div");
    content.className = "message-content typing";
    content.textContent = "Yanıt hazırlanıyor...";

    main.append(name, content);
    wrapper.append(createNovaAvatar(), main);
    messagesEl.appendChild(wrapper);

    messagesEl.scrollTop = messagesEl.scrollHeight;

    return { wrapper, content };
  }

  // SSE olayını işle
  function parseStreamEvent(eventText) {
    const dataLines = eventText
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""));

    if (!dataLines.length) return null;

    try {
      return JSON.parse(dataLines.join("\n"));
    } catch {
      return null;
    }
  }

  // Yanıt akışını oku
  async function readStreamingResponse(response, onChunk) {
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));

      throw new Error(
        data.error || `Sunucu hatası (${response.status}).`
      );
    }

    if (!response.body) {
      throw new Error(
        "Tarayıcı yanıt akışını okuyamadı. Sayfayı yenileyip tekrar dene."
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = "";
    let fullAnswer = "";
    let finished = false;
    let streamError = null;
    let provider = null;
    let model = null;

    function handleEvent(eventText) {
      const event = parseStreamEvent(eventText);

      if (!event) return;

      if (event.type === "start") {
        provider = event.provider || provider;
        model = event.model || model;
      } else if (event.type === "chunk") {
        if (
          typeof event.text === "string" &&
          event.text.length
        ) {
          fullAnswer += event.text;
          onChunk(event.text, fullAnswer);
        }
      } else if (event.type === "done") {
        finished = true;
        provider = event.provider || provider;
        model = event.model || model;
      } else if (event.type === "error") {
        streamError = new Error(
          event.error || "Yanıt akışı sırasında hata oluştu."
        );
        streamError.partial = Boolean(event.partial);
      }
    }

    try {
      while (true) {
        const { value, done } = await reader.read();

        buffer += decoder.decode(
          value || new Uint8Array(),
          { stream: !done }
        );

        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() || "";

        for (const eventText of events) {
          handleEvent(eventText);

          if (streamError) break;
        }

        if (streamError || done) break;
      }

      if (!streamError && buffer.trim()) {
        handleEvent(buffer);
      }
    } finally {
      reader.releaseLock();
    }

    if (streamError) {
      throw streamError;
    }

    if (!finished) {
      throw new Error(
        fullAnswer
          ? "Yanıt akışı beklenmedik şekilde kesildi."
          : "Sunucudan tamamlanmış bir yanıt alınamadı."
      );
    }

    if (!fullAnswer.trim()) {
      throw new Error("NOVA AI boş yanıt döndürdü.");
    }

    return {
      answer: fullAnswer.trim(),
      provider,
      model
    };
  }

  // Mesaj gönderme — düzeltilmiş bölüm
  async function sendMessage(rawText) {
    const text = String(rawText || "").trim();

    if (!text || busy || !currentUser) return;

    setBusy(true);

    let loading = null;
    let streamedAnswer = "";

    try {
      const conversation = await ensureConversation();

      await addMessage("user", text);

      prompt.value = "";
      prompt.style.height = "";

      const count = $("#characterCount");

      if (count) {
        count.textContent = "0/4000";
      }

      loading = createStreamingMessage();

      const {
        data: sessionData,
        error: sessionError
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      const token = sessionData.session?.access_token;

      if (!token) {
        throw new Error(
          "Oturum süren dolmuş. Yeniden giriş yap."
        );
      }

      const endpoint = researchMode
        ? "/api/research/stream"
        : "/api/chat/stream";

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          messages: conversation.messages
        })
      });

      const result = await readStreamingResponse(
        response,
        (_chunk, fullAnswer) => {
          streamedAnswer = fullAnswer;

          if (loading?.content) {
            loading.content.classList.remove("typing");
            loading.content.textContent = fullAnswer;
          }

          messagesEl.scrollTop = messagesEl.scrollHeight;
        }
      );

      await addMessage("assistant", result.answer);

      // Sesli sohbet, akış yanıtı tamamlandıktan sonra yanıtı seslendirir.
      if (window.NOVAVoice?.active) {
        window.NOVAVoice.speak(result.answer);
      }

      console.info(
        "[NOVA AI] Yanıt tamamlandı.",
        result.provider || "",
        result.model || ""
      );
    } catch (error) {
      console.error("NOVA AI mesaj hatası:", error);

      if (loading?.wrapper instanceof Element) {
        loading.wrapper.remove();
      }

      const message = streamedAnswer
        ? "Yanıt tamamlanmadan kesildi. Kısmi yanıt kaydedilmedi; lütfen tekrar dene."
        : error.message || "Mesaj gönderilemedi.";

      alert("NOVA AI: " + message);
    } finally {
      // loading bir HTML öğesi değil, { wrapper, content } nesnesi.
      if (loading?.wrapper instanceof Element) {
        loading.wrapper.remove();
      }

      // Gönderme işlemi hata alsa bile giriş alanını tekrar aç.
      setBusy(false);
      prompt.disabled = false;
      prompt.focus();
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage(prompt.value);
  });

  prompt.addEventListener("keydown", (event) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.isComposing
    ) {
      event.preventDefault();

      if (!busy && prompt.value.trim()) {
        form.requestSubmit();
      }
    }
  });

  prompt.addEventListener("input", () => {
    prompt.style.height = "auto";

    prompt.style.height =
      Math.min(prompt.scrollHeight, 180) + "px";

    const count = $("#characterCount");

    if (count) {
      count.textContent = `${prompt.value.length}/4000`;
    }
  });

  newChatButton?.addEventListener("click", () => {
    newChat();
  });

  researchButton?.addEventListener("click", () => {
    researchMode = !researchMode;

    researchButton.classList.toggle(
      "active",
      researchMode
    );

    researchButton.setAttribute(
      "aria-pressed",
      String(researchMode)
    );
  });

  menuButton?.addEventListener("click", () => {
    const isOpen = layout
      ? layout.classList.toggle("sidebar-open")
      : document.body.classList.toggle("menu-open");

    menuButton.setAttribute(
      "aria-expanded",
      String(isOpen)
    );
  });

  scrim?.addEventListener("click", closeMenu);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  });

  // Yapay zekâ ile resim oluşturma
  const imageGenerateButton = $("#imageGenerate");
  const imageStatus = $("#imageStatus");

  imageGenerateButton?.addEventListener("click", async () => {
    if (busy || !currentUser) return;
    const imagePrompt = window.prompt("Nasıl bir resim oluşturayım? Ayrıntıları yaz:");
    if (!imagePrompt?.trim()) return;
    imageGenerateButton.disabled = true;
    if (imageStatus) imageStatus.textContent = "Resim oluşturuluyor…";
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Oturum süren dolmuş. Yeniden giriş yap.");
      const response = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ prompt: imagePrompt.trim() })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Sunucu hatası (${response.status}).`);
      const mimeType = result.mimeType || "image/png";
      const binary = atob(result.image);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const imageBlob = new Blob([bytes], { type: mimeType });
      const imagePath = `${currentUser.id}/${crypto.randomUUID()}.png`;
      const { error: uploadError } = await supabase.storage
        .from("nova-ai-images")
        .upload(imagePath, imageBlob, { contentType: mimeType, upsert: false });
      if (uploadError) throw new Error("Resim oluşturuldu ama kaydedilemedi: " + uploadError.message);

      const conversation = await ensureConversation();
      conversation.messages.push({
        role: "assistant",
        type: "image",
        content: imagePrompt.trim(),
        imagePath,
        mimeType
      });
      conversation.updatedAt = Date.now();
      await save(conversation);
      renderMessages();
      renderHistory();

      const modal = document.createElement("div");
      modal.className = "auth-screen";
      modal.style.zIndex = "2000";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      const card = document.createElement("div");
      card.className = "auth-card";
      card.style.maxWidth = "900px";
      card.style.maxHeight = "90vh";
      card.style.overflow = "auto";
      const title = document.createElement("h2");
      title.textContent = "NOVA AI tarafından oluşturuldu";
      const image = document.createElement("img");
      image.alt = imagePrompt.trim();
      image.src = `data:${result.mimeType || "image/png"};base64,${result.image}`;
      image.style.cssText = "display:block;max-width:100%;max-height:65vh;object-fit:contain;margin:16px auto;border-radius:12px";
      const close = document.createElement("button");
      close.type = "button";
      close.className = "auth-submit";
      close.textContent = "Kapat";
      close.addEventListener("click", () => modal.remove());
      modal.addEventListener("click", event => { if (event.target === modal) modal.remove(); });
      card.append(title, image, close);
      modal.appendChild(card);
      document.body.appendChild(modal);
      if (imageStatus) imageStatus.textContent = "Resim hazır.";
    } catch (error) {
      console.error("NOVA AI resim hatası:", error);
      if (imageStatus) imageStatus.textContent = error.message || "Resim oluşturulamadı.";
    } finally {
      imageGenerateButton.disabled = false;
    }
  });

  // Diğer dosyaların kullanacağı NOVA fonksiyonları
  window.NOVA = {
    sendMessage,
    newChat,

    async speak(text) {
      const { data, error } = await supabase.auth.getSession();

      if (error) throw error;

      const token = data.session?.access_token;

      if (!token) {
        throw new Error(
          "Seslendirmek için giriş yapmalısın."
        );
      }

      const response = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ text })
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));

        throw new Error(
          result.error || "Ses oluşturulamadı."
        );
      }

      const url = URL.createObjectURL(
        await response.blob()
      );

      const audio = new Audio(url);

      audio.addEventListener(
        "ended",
        () => URL.revokeObjectURL(url),
        { once: true }
      );

      audio.addEventListener(
        "error",
        () => URL.revokeObjectURL(url),
        { once: true }
      );

      await audio.play();

      return audio;
    }
  };

  // Giriş yaptıktan sonra uygulamayı başlat
  async function initializeApp() {
    try {
      if (!currentUser) {
        setAuthenticatedUI(false);
        return;
      }

      setAuthenticatedUI(true);

      await loadConversations();

      if (!currentId) {
        const conversation = {
          id: createId(),
          title: "Yeni sohbet",
          messages: [],
          updatedAt: Date.now(),
          _isNew: true
        };

        conversations.push(conversation);
        currentId = conversation.id;

        renderHistory();
        renderMessages();
      }
    } catch (error) {
      console.error("Sohbetler yüklenemedi:", error);

      if (authMessage) {
        authMessage.textContent =
          "Sohbetler yüklenemedi: " + error.message;
      }

      setAuthenticatedUI(false);
    }
  }

  // Oturum kontrolü
  async function start() {
    setAuthMode("login");

    const { data, error } = await supabase.auth.getSession();

    if (error) {
      console.error(
        "Oturum kontrolü başarısız:",
        error
      );
    }

    currentUser = data.session?.user || null;

    if (currentUser) {
      await initializeApp();
    } else {
      setAuthenticatedUI(false);
    }

    supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user || null;

      if (nextUser?.id !== currentUser?.id) {
        currentUser = nextUser;

        if (currentUser) {
          setTimeout(() => {
            initializeApp();
          }, 0);
        } else {
          conversations = [];
          currentId = null;

          renderHistory();
          renderMessages();
          setAuthenticatedUI(false);
        }
      }
    });
  }

  start();
})();
