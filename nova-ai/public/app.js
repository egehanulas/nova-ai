
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

  // Supabase bağlantı ayarları
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

    if (loginTab) {
      loginTab.classList.toggle("active", isLogin);
    }

    if (registerTab) {
      registerTab.classList.toggle("active", !isLogin);
    }

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
        } else {
          if (authMessage) {
            authMessage.textContent =
              "Kayıt isteği gönderildi. E-posta doğrulaması " +
              "isteniyorsa gelen kutunu kontrol et; ardından giriş yap.";
          }
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
    } catch (error) {
      console.error("Çıkış yapılamadı:", error);

      alert("Çıkış yapılamadı: " + error.message);
    }
  });

  // Kullanıcının sohbetlerini Supabase'den yükle
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

  // Yeni sohbeti ekle, mevcut sohbeti güncelle
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

      // Önemli: Supabase'in gerçek ID'sini kullan.
      conversation.id = data.id;
      delete conversation._isNew;

      // Seçili sohbetin ID'sini de güncelle.
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

  // Seçili sohbet yoksa busy durumundan bağımsız oluştur.
  // Böylece mesaj gönderilirken newChat() engeline takılmaz.
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

  // Sol menüde sohbet geçmişini göster
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
      content.textContent =
        typeof item.content === "string"
          ? item.content
          : "";

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

  // Mesaj ekle ve Supabase'e kaydet
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

  // Mesaj gönderme ve NOVA AI yanıtını alma
  async function sendMessage(rawText) {
    const text = String(rawText || "").trim();

    if (!text || busy || !currentUser) return;

    setBusy(true);

    let loading;

    try {
      const conversation = await ensureConversation();

      await addMessage("user", text);

      prompt.value = "";
      prompt.style.height = "";

      loading = document.createElement("div");
      loading.className =
        "message assistant-message assistant loading";

      const loadingMain = document.createElement("div");
      loadingMain.className = "message-main";

      const loadingName = document.createElement("div");
      loadingName.className = "message-name";
      loadingName.textContent = "NOVA AI";

      const loadingText = document.createElement("div");
      loadingText.className = "message-content typing";
      loadingText.textContent = "Yanıt hazırlanıyor...";

      loadingMain.append(loadingName, loadingText);
      loading.append(createNovaAvatar(), loadingMain);
      messagesEl.appendChild(loading);

      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      const token = sessionData.session?.access_token;

      if (!token) {
        throw new Error(
          "Oturum süren dolmuş. Yeniden giriş yap."
        );
      }

      const response = await fetch(
        researchMode ? "/api/research" : "/api/chat",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({
            messages: conversation.messages
          })
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error || `Sunucu hatası (${response.status}).`
        );
      }

      if (
        !data.success ||
        typeof data.answer !== "string"
      ) {
        throw new Error(
          data.error || "Sunucudan geçerli yanıt alınamadı."
        );
      }

      await addMessage("assistant", data.answer);
    } catch (error) {
      console.error("NOVA AI mesaj hatası:", error);

      alert("Mesaj gönderilemedi: " + error.message);
    } finally {
      loading?.remove();

      setBusy(false);
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

  // Diğer dosyaların kullanacağı NOVA fonksiyonları
  window.NOVA = {
    sendMessage,
    newChat,

    async speak(text) {
      const { data, error } = await supabase.auth.getSession();

      if (error) throw error;

      const token = data.session?.access_token;

      const response = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token
            ? { "Authorization": `Bearer ${token}` }
            : {})
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
      console.error("Oturum kontrolü başarısız:", error);
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
