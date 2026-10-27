
(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);

  const form = $("#form") || $("#chat-form");
  const prompt = $("#prompt") || $("#message-input");
  const messagesEl = $("#messages") || $("#chat-messages");
  const sendButton = $("#send") || $("#send-button");
  const historyEl = $("#history");
  const newChatButton = $("#newChat") || $("#new-chat");
  const researchButton = $("#research");
  const menuButton = $("#menu");
  const scrim = $("#scrim");
  const layout = $("#layout");

  if (!form || !prompt || !messagesEl) {
    console.error(
      "NOVA AI: #form, #prompt ve #messages bulunamadı. index.html dosyasındaki ID'leri kontrol et."
    );
    return;
  }

  const STORAGE_KEY = "nova_ai_conversations_v1";
  const NOVA_ICON = "/nova-icon.png";

  let conversations = loadConversations();
  let currentId = null;
  let busy = false;
  let researchMode = false;

  function createId() {
    return Date.now().toString(36) +
      Math.random().toString(36).slice(2, 8);
  }

  // NOVA logosunu kullanan ortak simge oluşturucu.
  function createNovaAvatar(className = "message-avatar") {
    const avatar = document.createElement("div");
    avatar.className = className;
    avatar.setAttribute("aria-hidden", "true");

    const image = document.createElement("img");
    image.src = NOVA_ICON;
    image.alt = "";
    image.className = "nova-avatar-image";
    image.draggable = false;

    // Görsel yüklenemezse yıldız simgesine geri dön.
    image.addEventListener("error", () => {
      image.remove();
      avatar.textContent = "✦";
    }, { once: true });

    avatar.appendChild(image);
    return avatar;
  }

  function loadConversations() {
    try {
      const data = JSON.parse(
        localStorage.getItem(STORAGE_KEY) || "[]"
      );

      if (!Array.isArray(data)) return [];

      return data.filter(
        (item) =>
          item &&
          typeof item.id === "string" &&
          Array.isArray(item.messages)
      );
    } catch (error) {
      console.warn("NOVA AI: Sohbet geçmişi okunamadı.", error);
      return [];
    }
  }

  function save() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(conversations)
      );
    } catch (error) {
      console.warn(
        "NOVA AI: Sohbet geçmişi kaydedilemedi.",
        error
      );
    }
  }

  function currentConversation() {
    return conversations.find(
      (item) => item.id === currentId
    );
  }

  function closeMenu() {
    document.body.classList.remove("menu-open");

    if (layout) {
      layout.classList.remove("sidebar-open");
    }

    if (menuButton) {
      menuButton.setAttribute("aria-expanded", "false");
    }
  }

  function newChat() {
    currentId = createId();

    conversations.unshift({
      id: currentId,
      title: "Yeni sohbet",
      messages: [],
      updatedAt: Date.now()
    });

    save();
    renderMessages();
    renderHistory();
    closeMenu();
    prompt.focus();
  }

  function ensureConversation() {
    let conversation = currentConversation();

    if (!conversation) {
      newChat();
      conversation = currentConversation();
    }

    return conversation;
  }

  function renderHistory() {
    if (!historyEl) return;

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
      button.textContent = conversation.title || "Yeni sohbet";
      button.setAttribute("data-chat-id", conversation.id);

      if (conversation.id === currentId) {
        button.setAttribute("aria-current", "true");
      }

      button.addEventListener("click", () => {
        currentId = conversation.id;
        renderMessages();
        renderHistory();
        closeMenu();
      });

      row.appendChild(button);
      historyEl.appendChild(row);
    });

    const hint = $("#historyHint");

    if (hint) {
      hint.hidden = conversations.length > 0;
    }
  }

  function renderMessages() {
    const conversation = currentConversation();

    messagesEl.replaceChildren();

    if (!conversation || conversation.messages.length === 0) {
      const welcome = document.createElement("div");
      welcome.className = "welcome";

      const icon = createNovaAvatar("welcome-icon");

      const heading = document.createElement("h1");
      heading.textContent = "Merhaba, ben NOVA AI.";

      const description = document.createElement("p");
      description.textContent =
        "Aklındaki soruları sor, fikirlerini geliştir veya yeni bir şey keşfet. Sana nasıl yardımcı olabilirim?";

      welcome.append(icon, heading, description);
      messagesEl.appendChild(welcome);
      return;
    }

    conversation.messages.forEach((item) => {
      const isUser = item.role === "user";

      const wrapper = document.createElement("article");
      wrapper.className = isUser
        ? "message user-message user"
        : "message assistant-message assistant";

      const avatar = isUser
        ? document.createElement("div")
        : createNovaAvatar();

      if (isUser) {
        avatar.className = "message-avatar";
        avatar.setAttribute("aria-hidden", "true");
        avatar.textContent = "S";
      }

      const main = document.createElement("div");
      main.className = "message-main";

      const name = document.createElement("div");
      name.className = "message-name";
      name.textContent = isUser ? "Sen" : "NOVA AI";

      const content = document.createElement("div");
      content.className = "message-content";
      content.textContent =
        typeof item.content === "string" ? item.content : "";

      main.append(name, content);

      if (!isUser) {
        const actions = document.createElement("div");
        actions.className = "message-actions";

        const copyButton = document.createElement("button");
        copyButton.type = "button";
        copyButton.textContent = "Kopyala";
        copyButton.setAttribute("aria-label", "Yanıtı kopyala");

        copyButton.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(
              typeof item.content === "string" ? item.content : ""
            );

            copyButton.textContent = "Kopyalandı";

            setTimeout(() => {
              copyButton.textContent = "Kopyala";
            }, 1500);
          } catch (error) {
            console.warn("NOVA AI: Metin kopyalanamadı.", error);
            copyButton.textContent = "Kopyalanamadı";
          }
        });

        actions.appendChild(copyButton);
        main.appendChild(actions);
      }

      if (isUser) {
        wrapper.append(main);
      } else {
        wrapper.append(avatar, main);
      }

      messagesEl.appendChild(wrapper);
    });

    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addMessage(role, content) {
    const conversation = ensureConversation();

    conversation.messages.push({
      role,
      content
    });

    conversation.updatedAt = Date.now();

    if (
      role === "user" &&
      conversation.title === "Yeni sohbet"
    ) {
      conversation.title = content.slice(0, 45);
    }

    save();
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

  async function sendMessage(rawText) {
    const text = String(rawText || "").trim();

    if (!text || busy) return;

    ensureConversation();

    addMessage("user", text);
    prompt.value = "";
    prompt.style.height = "";

    const conversation = currentConversation();
    const endpoint = researchMode
      ? "/api/research"
      : "/api/chat";

    setBusy(true);

    const loading = document.createElement("div");
    loading.className =
      "message assistant-message assistant loading";

    const loadingAvatar = createNovaAvatar();

    const loadingMain = document.createElement("div");
    loadingMain.className = "message-main";

    const loadingName = document.createElement("div");
    loadingName.className = "message-name";
    loadingName.textContent = "NOVA AI";

    const loadingText = document.createElement("div");
    loadingText.className = "message-content typing";
    loadingText.textContent = "Yanıt hazırlanıyor...";

    loadingMain.append(loadingName, loadingText);
    loading.append(loadingAvatar, loadingMain);
    messagesEl.appendChild(loading);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: conversation.messages
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ||
          `Sunucu isteği başarısız oldu (${response.status}).`
        );
      }

      if (!data.success || typeof data.answer !== "string") {
        throw new Error(
          data.error ||
          "Sunucu yanıt verdi ancak beklenen cevap formatı alınamadı."
        );
      }

      addMessage("assistant", data.answer);
    } catch (error) {
      console.error("NOVA AI isteği başarısız:", error);

      addMessage(
        "assistant",
        `Bir hata oluştu: ${error.message}\n\n` +
        "Sunucu loglarını ve API sağlayıcısının durumunu kontrol et."
      );
    } finally {
      loading.remove();
      setBusy(false);
      prompt.focus();
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    if (busy) return;

    sendMessage(prompt.value);
  });

  prompt.addEventListener("keydown", (event) => {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.isComposing
    ) {
      return;
    }

    event.preventDefault();

    if (!busy && prompt.value.trim()) {
      if (typeof form.requestSubmit === "function") {
        form.requestSubmit();
      } else {
        sendMessage(prompt.value);
      }
    }
  });

  prompt.addEventListener("input", () => {
    prompt.style.height = "auto";

    const maxHeight = 180;
    prompt.style.height =
      Math.min(prompt.scrollHeight, maxHeight) + "px";
  });

  if (newChatButton) {
    newChatButton.addEventListener("click", newChat);
  }

  if (researchButton) {
    researchButton.addEventListener("click", () => {
      researchMode = !researchMode;

      researchButton.classList.toggle("active", researchMode);
      researchButton.setAttribute(
        "aria-pressed",
        String(researchMode)
      );

      researchButton.title = researchMode
        ? "Araştırma modu açık"
        : "Araştırma modu kapalı";
    });
  }

  if (menuButton) {
    menuButton.addEventListener("click", () => {
      const isOpen = layout
        ? layout.classList.toggle("sidebar-open")
        : document.body.classList.toggle("menu-open");

      menuButton.setAttribute(
        "aria-expanded",
        String(isOpen)
      );
    });
  }

  if (scrim) {
    scrim.addEventListener("click", closeMenu);
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  });

  window.NOVA = {
    sendMessage,

    async speak(text) {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ text })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          data.error || "Ses oluşturulamadı."
        );
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
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

      try {
        await audio.play();
      } catch (error) {
        URL.revokeObjectURL(url);
        throw error;
      }

      return audio;
    },

    newChat
  };

  if (conversations.length > 0) {
    currentId = conversations[0].id;
    renderMessages();
    renderHistory();
  } else {
    newChat();
  }

  console.log("NOVA AI arayüz kodu yüklendi.");
})();
