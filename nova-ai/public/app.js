// NOVA AI — Sohbet uygulaması
// API: POST /api/chat
// Sohbet geçmişi tarayıcının localStorage alanında tutulur.

const STORAGE_KEY = "nova_ai_chats_v1";

const el = {
  layout: document.getElementById("layout"),
  scrim: document.getElementById("scrim"),
  sidebar: document.getElementById("sidebar"),
  newChat: document.getElementById("newChat"),
  history: document.getElementById("history"),
  messages: document.getElementById("messages"),
  menu: document.getElementById("menu"),
  form: document.getElementById("form"),
  prompt: document.getElementById("prompt"),
  send: document.getElementById("send"),
};

let chats = loadChats();
let activeChatId = chats[0]?.id ?? null;
let busy = false;
let activeController = null;

function createId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function loadChats() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveChats() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
}

function getActiveChat() {
  return chats.find((chat) => chat.id === activeChatId) ?? null;
}

function createChat() {
  const chat = {
    id: createId(),
    title: "Yeni sohbet",
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  chats.unshift(chat);
  activeChatId = chat.id;
  saveChats();
  renderHistory();
  renderMessages();
  closeSidebar();
  el.prompt?.focus();
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function renderMarkdown(text = "") {
  let html = escapeHTML(text);

  // Kod blokları
  html = html.replace(/```([\w+-]*)\n?([\s\S]*?)```/g, (_, language, code) => {
    return `<pre class="nova-code-block"><div class="code-header">${escapeHTML(language || "kod")}</div><code>${code}</code></pre>`;
  });

  // Satır içi kod
  html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");

  // Kalın ve italik
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");

  // Başlıklar
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Alıntılar
  html = html.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");

  // Listeler
  html = html.replace(/^[*-] (.+)$/gm, "<li>$1</li>");
  html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (list) => `<ul>${list}</ul>`);

  // Satır sonları
  html = html.replace(/\n/g, "<br>");

  return html;
}

function renderHistory() {
  if (!el.history) return;

  if (chats.length === 0) {
    el.history.innerHTML = '<p class="history-empty">Henüz sohbet yok.</p>';
    return;
  }

  el.history.innerHTML = chats.map((chat) => `
    <div class="history-row ${chat.id === activeChatId ? "active" : ""}">
      <button class="history-item" data-chat-id="${escapeHTML(chat.id)}" title="${escapeHTML(chat.title)}">
        <span class="history-icon">◷</span>
        <span class="history-title">${escapeHTML(chat.title)}</span>
      </button>
      <button class="history-delete" data-delete-id="${escapeHTML(chat.id)}" aria-label="Sohbeti sil" title="Sohbeti sil">×</button>
    </div>
  `).join("");

  el.history.querySelectorAll("[data-chat-id]").forEach((button) => {
    button.addEventListener("click", () => openChat(button.dataset.chatId));
  });

  el.history.querySelectorAll("[data-delete-id]").forEach((button) => {
    button.addEventListener("click", () => deleteChat(button.dataset.deleteId));
  });
}

function renderMessages() {
  if (!el.messages) return;

  const chat = getActiveChat();

  if (!chat || chat.messages.length === 0) {
    el.messages.innerHTML = `
      <div class="welcome">
        <div class="welcome-icon">✦</div>
        <h1>Merhaba, ben NOVA.</h1>
        <p>Bugün sana nasıl yardımcı olabilirim?</p>
      </div>
    `;
    return;
  }

  el.messages.innerHTML = chat.messages.map((message, index) => {
    const isUser = message.role === "user";
    return `
      <article class="message ${isUser ? "user-message" : "assistant-message"}">
        <div class="message-avatar">${isUser ? "Sen" : "✦"}</div>
        <div class="message-main">
          <div class="message-name">${isUser ? "Sen" : "NOVA AI"}</div>
          <div class="message-content">${isUser
            ? escapeHTML(message.content).replace(/\n/g, "<br>")
            : renderMarkdown(message.content)}</div>
          ${!isUser ? `
            <div class="message-actions">
              <button data-copy-index="${index}" title="Yanıtı kopyala">Kopyala</button>
              <button data-retry-index="${index}" title="Yanıtı yeniden oluştur">Yeniden dene</button>
            </div>` : ""}
        </div>
      </article>
    `;
  }).join("");

  el.messages.querySelectorAll("[data-copy-index]").forEach((button) => {
    button.addEventListener("click", async () => {
      const message = getActiveChat()?.messages[Number(button.dataset.copyIndex)];
      if (!message) return;

      try {
        await navigator.clipboard.writeText(message.content);
        button.textContent = "Kopyalandı ✓";
        setTimeout(() => button.textContent = "Kopyala", 1500);
      } catch {
        alert("Kopyalama başarısız oldu. Metni seçip kopyalayabilirsin.");
      }
    });
  });

  el.messages.querySelectorAll("[data-retry-index]").forEach((button) => {
    button.addEventListener("click", () => retryAnswer(Number(button.dataset.retryIndex)));
  });

  el.messages.scrollTop = el.messages.scrollHeight;
}

function openChat(id) {
  if (busy) return;
  if (!chats.some((chat) => chat.id === id)) return;

  activeChatId = id;
  renderHistory();
  renderMessages();
  closeSidebar();
}

function deleteChat(id) {
  if (busy) return;

  chats = chats.filter((chat) => chat.id !== id);

  if (activeChatId === id) {
    activeChatId = chats[0]?.id ?? null;
  }

  saveChats();
  renderHistory();
  renderMessages();
}

function setStatus(message, isError = false) {
  const status = document.querySelector(".status");
  if (!status) return;

  status.innerHTML = `<i></i> ${escapeHTML(message)}`;
  status.classList.toggle("error", isError);
}

function setBusy(value) {
  busy = value;

  if (el.send) {
    el.send.disabled = value;
    el.send.textContent = value ? "…" : "↑";
  }

  if (el.prompt) el.prompt.disabled = value;
  if (el.newChat) el.newChat.disabled = value;

  setStatus(value ? "Düşünüyor…" : "Hazır");
}

function addMessage(role, content) {
  const chat = getActiveChat();
  if (!chat) return;

  chat.messages.push({ role, content });
  chat.updatedAt = Date.now();

  if (role === "user" && chat.title === "Yeni sohbet") {
    chat.title = content.trim().slice(0, 35) || "Yeni sohbet";
  }

  saveChats();
  renderHistory();
  renderMessages();
}

async function requestAssistant() {
  const chat = getActiveChat();
  if (!chat || busy) return;

  const lastMessage = chat.messages[chat.messages.length - 1];
  if (!lastMessage || lastMessage.role !== "user") return;

  setBusy(true);
  activeController = new AbortController();

  const timeout = setTimeout(() => activeController?.abort(), 90000);

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: chat.messages.map(({ role, content }) => ({ role, content })),
      }),
      signal: activeController.signal,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || data.message || `Sunucu hatası (${response.status})`);
    }

    const reply = data.reply ?? data.text ?? data.message;

    if (typeof reply !== "string" || !reply.trim()) {
      throw new Error("NOVA boş yanıt döndürdü.");
    }

    addMessage("assistant", reply.trim());
    setStatus("Hazır");
  } catch (error) {
    if (error.name === "AbortError") {
      addMessage("assistant", "İstek zaman aşımına uğradı. Lütfen tekrar dene.");
    } else {
      addMessage("assistant", `Bir sorun oluştu: ${error.message}\n\nBiraz sonra tekrar deneyebilirsin.`);
      setStatus("Bağlantı hatası", true);
    }
  } finally {
    clearTimeout(timeout);
    activeController = null;
    setBusy(false);
  }
}

async function retryAnswer(index) {
  if (busy) return;

  const chat = getActiveChat();
  if (!chat) return;

  const message = chat.messages[index];
  if (!message || message.role !== "assistant") return;

  // Yeniden dene butonu yalnızca en son yanıt için kullanılabilir.
  if (index !== chat.messages.length - 1) {
    alert("Yalnızca en son NOVA yanıtını yeniden deneyebilirsin.");
    return;
  }

  chat.messages.pop();

  if (chat.messages[chat.messages.length - 1]?.role !== "user") {
    chat.messages.push(message);
    return;
  }

  saveChats();
  renderMessages();
  await requestAssistant();
}

function closeSidebar() {
  el.layout?.classList.remove("sidebar-open");
}

function toggleSidebar() {
  el.layout?.classList.toggle("sidebar-open");
}

function exportChat() {
  const chat = getActiveChat();
  if (!chat) return;

  const content = chat.messages.map((message) =>
    `${message.role === "user" ? "Sen" : "NOVA AI"}:\n${message.content}`
  ).join("\n\n--------------------\n\n");

  downloadText(`${chat.title || "nova-sohbet"}.txt`, content);
}

function exportAllChats() {
  const content = chats.map((chat) => {
    const messages = chat.messages.map((message) =>
      `${message.role === "user" ? "Sen" : "NOVA AI"}:\n${message.content}`
    ).join("\n\n");

    return `# ${chat.title}\n\n${messages}`;
  }).join("\n\n====================\n\n");

  downloadText("nova-tum-sohbetler.txt", content);
}

function downloadText(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

function sendMessage(content) {
  const text = content.trim();
  if (!text || busy) return;

  if (!getActiveChat()) createChat();

  addMessage("user", text);

  if (el.prompt) {
    el.prompt.value = "";
    el.prompt.style.height = "auto";
  }

  requestAssistant();
}

el.newChat?.addEventListener("click", createChat);
el.menu?.addEventListener("click", toggleSidebar);
el.scrim?.addEventListener("click", closeSidebar);

el.form?.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(el.prompt?.value || "");
});

el.prompt?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    el.form?.requestSubmit();
  }
});

el.prompt?.addEventListener("input", () => {
  el.prompt.style.height = "auto";
  el.prompt.style.height = `${Math.min(el.prompt.scrollHeight, 180)}px`;
});

window.NOVA = {
  newChat: createChat,
  exportChat,
  exportAllChats,
};

renderHistory();
renderMessages();
