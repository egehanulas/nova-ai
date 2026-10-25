// NOVA AI — Sohbet uygulaması
// API: POST /api/chat
// Sohbet geçmişi tarayıcının localStorage alanında tutulur.

const STORAGE_KEY = "nova_ai_chats_v1";
const MAX_CHATS = 50;
const MAX_LENGTH = 4000;
const REQUEST_TIMEOUT = 90000;

// Üç ters tırnak (kod bloğu işareti)
const FENCE = "`".repeat(3);
const CODE_BLOCK = new RegExp(FENCE + "([\\w+#-]*)[ \\t]*\\n?([\\s\\S]*?)" + FENCE, "g");

const el = {
  layout: document.getElementById("layout"),
  scrim: document.getElementById("scrim"),
  sidebar: document.getElementById("sidebar"),
  newChat: document.getElementById("newChat"),
  history: document.getElementById("history"),
  historyHint: document.getElementById("historyHint"),
  messages: document.getElementById("messages"),
  menu: document.getElementById("menu"),
  form: document.getElementById("form"),
  prompt: document.getElementById("prompt"),
  send: document.getElementById("send"),
  status: document.getElementById("connectionStatus"),
  count: document.getElementById("characterCount"),
};

let chats = loadChats();
let activeChatId = chats[0]?.id ?? null;
let busy = false;

/* ---------- Yardımcılar ---------- */

function createId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function loadChats() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(saved)) return [];
    return saved
      .filter((c) => c && typeof c.id === "string" && Array.isArray(c.messages))
      .slice(0, MAX_CHATS);
  } catch {
    return [];
  }
}

function saveChats() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats.slice(0, MAX_CHATS)));
  } catch {
    // Depolama dolu ya da kapalıysa uygulama yine de çalışmaya devam eder.
  }
}

function getActiveChat() {
  return chats.find((chat) => chat.id === activeChatId) ?? null;
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

/* ---------- Markdown ---------- */

function renderMarkdown(text = "") {
  const blocks = [];
  const inlines = [];

  // Kod bloklarını ayır, böylece içlerindeki *, # gibi karakterler bozulmaz.
  let html = String(text).replace(CODE_BLOCK, (_, lang, code) => {
    blocks.push({ lang: lang || "kod", code: code.replace(/\n$/, "") });
    return `\u0000B${blocks.length - 1}\u0000`;
  });

  html = escapeHTML(html);

  // Satır içi kodları ayır
  html = html.replace(/`([^`\n]+)`/g, (_, code) => {
    inlines.push(code);
    return `\u0000I${inlines.length - 1}\u0000`;
  });

  html = html
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^\s*][^*\n]*?)\*/g, "<em>$1</em>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>")
    .replace(/^[*-] (.+)$/gm, "<li>$1</li>")
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    .replace(/(?:<li>.*<\/li>\n?)+/g, (list) => `<ul>${list.replace(/\n/g, "")}</ul>`)
    .replace(/\n?(<\/?(?:ul|h[1-3]|blockquote)>)\n?/g, "$1")
    .replace(/\n?(\u0000B\d+\u0000)\n?/g, "$1")
    .replace(/\n/g, "<br>");

  // Ayırdığımız parçaları geri koy
  return html
    .replace(/\u0000I(\d+)\u0000/g, (_, i) => `<code>${inlines[i]}</code>`)
    .replace(/\u0000B(\d+)\u0000/g, (_, i) => {
      const { lang, code } = blocks[i];
      return `<pre class="nova-code-block"><div class="code-header">${escapeHTML(lang)}</div><code>${escapeHTML(code)}</code></pre>`;
    });
}

/* ---------- Görünüm ---------- */

function renderHistory() {
  if (!el.history) return;

  if (el.historyHint) {
    el.historyHint.style.display = chats.length ? "none" : "";
  }

  el.history.innerHTML = chats.map((chat) => `
    <div class="history-row ${chat.id === activeChatId ? "active" : ""}" role="listitem">
      <button type="button" class="history-item" data-chat-id="${escapeHTML(chat.id)}"
              title="${escapeHTML(chat.title)}"${chat.id === activeChatId ? ' aria-current="true"' : ""}>
        <span class="history-icon" aria-hidden="true">◷</span>
        <span class="history-title">${escapeHTML(chat.title)}</span>
      </button>
      <button type="button" class="history-delete" data-delete-id="${escapeHTML(chat.id)}"
              aria-label="Sohbeti sil" title="Sohbeti sil">×</button>
    </div>
  `).join("");
}

function renderMessages() {
  if (!el.messages) return;

  const chat = getActiveChat();

  if (!chat || (chat.messages.length === 0 && !busy)) {
    el.messages.innerHTML = `
      <div class="welcome">
        <div class="welcome-icon">✦</div>
        <h1>Merhaba, ben NOVA.</h1>
        <p>Bugün sana nasıl yardımcı olabilirim?</p>
      </div>
    `;
    return;
  }

  const lastIndex = chat.messages.length - 1;

  let html = chat.messages.map((message, index) => {
    const isUser = message.role === "user";
    const classes = ["message", isUser ? "user-message" : "assistant-message"];
    if (message.error) classes.push("error-message");

    let actions = "";
    if (!isUser) {
      if (!message.error) {
        actions += `<button type="button" data-copy-index="${index}" title="Yanıtı kopyala">Kopyala</button>`;
      }
      // "Yeniden dene" yalnızca en son yanıtta görünür.
      if (index === lastIndex && !busy) {
        actions += `<button type="button" data-retry-index="${index}" title="Yanıtı yeniden oluştur">Yeniden dene</button>`;
      }
    }

    const content = isUser || message.error
      ? escapeHTML(message.content).replace(/\n/g, "<br>")
      : renderMarkdown(message.content);

    return `
      <article class="${classes.join(" ")}">
        <div class="message-avatar" aria-hidden="true">${isUser ? "S" : "✦"}</div>
        <div class="message-main">
          <div class="message-name">${isUser ? "Sen" : "NOVA AI"}</div>
          <div class="message-content">${content}</div>
          ${actions ? `<div class="message-actions">${actions}</div>` : ""}
        </div>
      </article>
    `;
  }).join("");

  if (busy) {
    html += `
      <article class="message assistant-message">
        <div class="message-avatar" aria-hidden="true">✦</div>
        <div class="message-main">
          <div class="message-name">NOVA AI</div>
          <div class="message-content typing">Düşünüyor…</div>
        </div>
      </article>
    `;
  }

  el.messages.innerHTML = html;
  el.messages.scrollTop = el.messages.scrollHeight;
}

function setStatus(message, isError = false) {
  if (!el.status) return;

  el.status.innerHTML = `<i aria-hidden="true"></i><span>${escapeHTML(message)}</span>`;
  el.status.classList.toggle("error", isError);
  el.status.classList.toggle("busy", busy && !isError);
}

function setBusy(value, failure = null) {
  busy = value;

  if (el.send) {
    el.send.disabled = value;
    el.send.classList.toggle("is-busy", value);
    el.send.setAttribute("aria-busy", String(value));
  }

  if (el.newChat) el.newChat.disabled = value;

  if (value) setStatus("Düşünüyor…");
  else if (failure) setStatus(failure, true);
  else setStatus("Hazır");

  renderMessages();

  if (!value) el.prompt?.focus();
}

function updateCount() {
  if (!el.count || !el.prompt) return;
  const length = el.prompt.value.length;
  el.count.textContent = length > 3000 ? `${length} / ${MAX_LENGTH}` : "";
}

function resizePrompt() {
  if (!el.prompt) return;
  el.prompt.style.height = "auto";
  el.prompt.style.height = `${Math.min(el.prompt.scrollHeight, 180)}px`;
}

/* ---------- Sohbet işlemleri ---------- */

function createChat() {
  if (busy) return;

  // Zaten boş bir sohbet varsa yenisini oluşturma, ona geç.
  const empty = chats.find((chat) => chat.messages.length === 0);

  if (empty) {
    activeChatId = empty.id;
  } else {
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
  }

  renderHistory();
  renderMessages();
  closeSidebar();
  el.prompt?.focus();
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
  if (!confirm("Bu sohbet silinsin mi?")) return;

  chats = chats.filter((chat) => chat.id !== id);

  if (activeChatId === id) {
    activeChatId = chats[0]?.id ?? null;
  }

  saveChats();
  renderHistory();
  renderMessages();
}

function addMessage(role, content, { chat = getActiveChat(), error = false } = {}) {
  if (!chat) return;

  const message = { role, content };
  if (error) message.error = true;

  chat.messages.push(message);
  chat.updatedAt = Date.now();

  if (role === "user" && chat.title === "Yeni sohbet") {
    chat.title = content.replace(/\s+/g, " ").trim().slice(0, 35) || "Yeni sohbet";
  }

  saveChats();
  renderHistory();
  renderMessages();
}

// Hata mesajlarını modele gönderme, arka arkaya gelen kullanıcı mesajlarını birleştir.
function buildPayload(chat) {
  const payload = [];

  for (const message of chat.messages) {
    if (message.error) continue;

    const previous = payload[payload.length - 1];

    if (previous && previous.role === message.role) {
      previous.content += `\n\n${message.content}`;
    } else {
      payload.push({ role: message.role, content: message.content });
    }
  }

  return payload;
}

async function requestAssistant() {
  const chat = getActiveChat();
  if (!chat || busy) return;

  const last = chat.messages[chat.messages.length - 1];
  if (!last || last.role !== "user") return;

  setBusy(true);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  let failure = null;

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: buildPayload(chat) }),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || data.message || `Sunucu hatası (${response.status})`);
    }

    const reply = data.reply ?? data.text ?? data.message;

    if (typeof reply !== "string" || !reply.trim()) {
      throw new Error("NOVA boş yanıt döndürdü.");
    }

    addMessage("assistant", reply.trim(), { chat });
  } catch (error) {
    let text = error.message;
    failure = "Bağlantı hatası";

    if (error.name === "AbortError") {
      failure = "Zaman aşımı";
      text = "İstek zaman aşımına uğradı. Lütfen tekrar dene.";
    } else if (error instanceof TypeError) {
      text = "Sunucuya ulaşılamadı. İnternet bağlantını ve sunucunun çalıştığını kontrol et.";
    }

    addMessage("assistant", text, { chat, error: true });
  } finally {
    clearTimeout(timeout);
    setBusy(false, failure);
  }
}

async function retryAnswer(index) {
  if (busy) return;

  const chat = getActiveChat();
  if (!chat || index !== chat.messages.length - 1) return;

  const message = chat.messages[index];
  if (!message || message.role !== "assistant") return;

  chat.messages.pop();

  if (chat.messages[chat.messages.length - 1]?.role !== "user") {
    chat.messages.push(message);
    return;
  }

  saveChats();
  renderMessages();
  await requestAssistant();
}

function sendMessage(content) {
  const text = content.trim();
  if (!text || busy) return;

  if (!getActiveChat()) createChat();

  addMessage("user", text);

  if (el.prompt) el.prompt.value = "";
  resizePrompt();
  updateCount();

  requestAssistant();
}

/* ---------- Menü ---------- */

function closeSidebar() {
  el.layout?.classList.remove("sidebar-open");
  el.menu?.setAttribute("aria-expanded", "false");
}

function toggleSidebar() {
  const open = el.layout?.classList.toggle("sidebar-open");
  el.menu?.setAttribute("aria-expanded", String(Boolean(open)));
}

/* ---------- Dışa aktarma ---------- */

function downloadText(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatMessages(messages) {
  return messages
    .filter((message) => !message.error)
    .map((message) => `${message.role === "user" ? "Sen" : "NOVA AI"}:\n${message.content}`)
    .join("\n\n--------------------\n\n");
}

function exportChat() {
  const chat = getActiveChat();
  if (!chat) return;

  downloadText(`${chat.title || "nova-sohbet"}.txt`, formatMessages(chat.messages));
}

function exportAllChats() {
  const content = chats
    .map((chat) => `# ${chat.title}\n\n${formatMessages(chat.messages)}`)
    .join("\n\n====================\n\n");

  downloadText("nova-tum-sohbetler.txt", content);
}

/* ---------- Olaylar ---------- */

el.newChat?.addEventListener("click", createChat);
el.menu?.addEventListener("click", toggleSidebar);
el.scrim?.addEventListener("click", closeSidebar);

if (el.form) el.form.noValidate = true;

el.form?.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(el.prompt?.value || "");
});

el.prompt?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    el.form?.requestSubmit();
  }
});

el.prompt?.addEventListener("input", () => {
  resizePrompt();
  updateCount();
});

// Sohbet geçmişi: aç / sil
el.history?.addEventListener("click", (event) => {
  const remove = event.target.closest("[data-delete-id]");
  if (remove) return deleteChat(remove.dataset.deleteId);

  const open = event.target.closest("[data-chat-id]");
  if (open) openChat(open.dataset.chatId);
});

// Mesajlar: kopyala / yeniden dene
el.messages?.addEventListener("click", async (event) => {
  const copy = event.target.closest("[data-copy-index]");

  if (copy) {
    const message = getActiveChat()?.messages[Number(copy.dataset.copyIndex)];
    if (!message) return;

    try {
      await navigator.clipboard.writeText(message.content);
      copy.textContent = "Kopyalandı ✓";
      setTimeout(() => { copy.textContent = "Kopyala"; }, 1500);
    } catch {
      alert("Kopyalama başarısız oldu. Metni seçip kopyalayabilirsin.");
    }
    return;
  }

  const retry = event.target.closest("[data-retry-index]");
  if (retry) retryAnswer(Number(retry.dataset.retryIndex));
});

// Klavye kısayolları: Esc menüyü kapatır, N yeni sohbet açar.
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeSidebar();

  const active = document.activeElement;
  const typing = active && (
    active.tagName === "TEXTAREA" ||
    active.tagName === "INPUT" ||
    active.isContentEditable
  );

  if (!typing && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === "n") {
    event.preventDefault();
    createChat();
  }
});

window.NOVA = {
  newChat: createChat,
  exportChat,
  exportAllChats,
};

renderHistory();
renderMessages();
