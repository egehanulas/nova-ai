
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

  if (!form || !prompt || !messagesEl) {
    console.error(
      "NOVA AI: #form, #prompt ve #messages bulunamadı. index.html dosyasındaki ID'leri kontrol et."
    );
    return;
  }

  const STORAGE_KEY = "nova_ai_conversations_v1";

  let conversations = loadConversations();
  let currentId = null;
  let busy = false;
  let researchMode = false;

  function createId() {
    return Date.now().toString(36) +
      Math.random().toString(36).slice(2, 8);
  }

  function loadConversations() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    } catch (error) {
      console.warn("NOVA AI: Sohbet geçmişi kaydedilemedi.", error);
    }
  }

  function currentConversation() {
    return conversations.find((item) => item.id === currentId);
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
      const button = document.createElement("button");
      button.type = "button";
      button.className = "history-item";
      button.textContent = conversation.title || "Yeni sohbet";
      button.setAttribute("data-chat-id", conversation.id);

      if (conversation.id === currentId) {
        button.classList.add("active");
        button.setAttribute("aria-current", "true");
      }

      button.addEventListener("click", () => {
        currentId = conversation.id;
        renderMessages();
        renderHistory();
      });

      historyEl.appendChild(button);
    });
  }

  function renderMessages() {
    const conversation = currentConversation();
    messagesEl.replaceChildren();

    if (!conversation || conversation.messages.length === 0) {
      const welcome = document.createElement("div");
      welcome.className = "welcome-message";
      welcome.textContent = "Merhaba! Ben NOVA AI. Sana nasıl yardımcı olabilirim?";
      messagesEl.appendChild(welcome);
      return;
    }

    conversation.messages.forEach((item) => {
      const wrapper = document.createElement("div");
      wrapper.className = `message ${item.role}`;

      const content = document.createElement("div");
      content.className = "message-content";
      content.textContent = item.content;

      wrapper.appendChild(content);

      if (item.role === "assistant") {
        const copyButton = document.createElement("button");
        copyButton.type = "button";
        copyButton.className = "copy-message";
        copyButton.textContent = "Kopyala";
        copyButton.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(item.content);
            copyButton.textContent = "Kopyalandı";
            setTimeout(() => {
              copyButton.textContent = "Kopyala";
            }, 1500);
          } catch {
            copyButton.textContent = "Kopyalanamadı";
          }
        });
        wrapper.appendChild(copyButton);
      }

      messagesEl.appendChild(wrapper);
    });

    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addMessage(role, content) {
    const conversation = ensureConversation();
    conversation.messages.push({ role, content });
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
    }

    form.setAttribute("aria-busy", String(value));
  }

  async function sendMessage(rawText) {
    const text = rawText.trim();

    if (!text || busy) return;

    ensureConversation();

    addMessage("user", text);
    prompt.value = "";

    const conversation = currentConversation();
    const endpoint = researchMode ? "/api/research" : "/api/chat";

    setBusy(true);

    const loading = document.createElement("div");
    loading.className = "message assistant loading";
    loading.textContent = "NOVA AI yanıt hazırlıyor...";
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

      if (!response.ok || !data.success || typeof data.answer !== "string") {
        throw new Error(data.error || `İstek başarısız (${response.status}).`);
      }

      addMessage("assistant", data.answer);
    } catch (error) {
      console.error("NOVA AI isteği başarısız:", error);
      addMessage(
        "assistant",
        `Bir hata oluştu: ${error.message}\n\nSunucunun çalıştığını ve API anahtarlarının ayarlı olduğunu kontrol et.`
      );
    } finally {
      loading.remove();
      setBusy(false);
      prompt.focus();
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage(prompt.value);
  });

  if (newChatButton) {
    newChatButton.addEventListener("click", newChat);
  }

  if (researchButton) {
    researchButton.addEventListener("click", () => {
      researchMode = !researchMode;
      researchButton.classList.toggle("active", researchMode);
      researchButton.setAttribute("aria-pressed", String(researchMode));
      researchButton.title = researchMode
        ? "Araştırma modu açık"
        : "Araştırma modu kapalı";
    });
  }

  if (menuButton && scrim) {
    menuButton.addEventListener("click", () => {
      document.body.classList.toggle("menu-open");
    });

    scrim.addEventListener("click", () => {
      document.body.classList.remove("menu-open");
    });
  }

  // ElevenLabs metinden sese özelliği
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
        throw new Error(data.error || "Ses oluşturulamadı.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);

      audio.addEventListener("ended", () => URL.revokeObjectURL(url), {
        once: true
      });

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
