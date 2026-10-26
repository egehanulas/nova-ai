
const STORAGE_KEY = "nova_ai_chats_v1";
const MAX_CHATS = 50;
const MAX_LENGTH = 4000;
const REQUEST_TIMEOUT = 90000;

const FENCE = "`".repeat(3);
const CODE_BLOCK = new RegExp(
  FENCE + "([\\w+#.-]*)[ \\t]*\\n?([\\s\\S]*?)" + FENCE,
  "g"
);

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
let requestId = 0;

function createId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function loadChats() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(saved)) return [];

    return saved
      .filter(c =>
        c &&
        typeof c.id === "string" &&
        Array.isArray(c.messages)
      )
      .map(c => ({
        id: c.id,
        title: String(c.title || "Yeni sohbet").slice(0, 100),
        messages: c.messages
          .filter(m =>
            m &&
            ["user", "assistant"].includes(m.role) &&
            typeof m.content === "string"
          )
          .map(m => ({
            role: m.role,
            content: m.content.slice(0, MAX_LENGTH * 4),
            ...(m.error ? { error: true } : {})
          })),
        createdAt: Number(c.createdAt) || Date.now(),
        updatedAt: Number(c.updatedAt) || Date.now()
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_CHATS);
  } catch {
    return [];
  }
}

function saveChats() {
  try {
    chats.sort((a, b) => b.updatedAt - a.updatedAt);
    chats = chats.slice(0, MAX_CHATS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  } catch {
    setStatus("Geçmiş kaydedilemedi", true);
  }
}

function getActiveChat() {
  return chats.find(c => c.id === activeChatId) ?? null;
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function renderMarkdown(text = "") {
  const blocks = [];
  const inlines = [];

  let html = String(text).replace(CODE_BLOCK, (_, lang, code) => {
    blocks.push({
      lang: lang || "kod",
      code: code.replace(/\n$/, "")
    });
    return `\u0000B${blocks.length - 1}\u0000`;
  });

  html = escapeHTML(html);

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
    .replace(/(?:<li>.*<\/li>\n?)+/g, list =>
      `<ul>${list.replace(/\n/g, "")}</ul>`
    )
    .replace(/\n?(<\/?(?:ul|h[1-3]|blockquote)>)\n?/g, "$1")
    .replace(/\n?(\u0000B\d+\u0000)\n?/g, "$1")
    .replace(/\n/g, "<br>");

  return html
    .replace(/\u0000I(\d+)\u0000/g, (_, i) =>
      `<code>${inlines[Number(i)]}</code>`
    )
    .replace(/\u0000B(\d+)\u0000/g, (_, i) => {
      const block = blocks[Number(i)];
      return `<pre class="nova-code-block"><div class="code-header">${escapeHTML(block.lang)}</div><code>${escapeHTML(block.code)}</code></pre>`;
    });
}

function renderHistory() {
  if (!el.history) return;

  if (el.historyHint) {
    el.historyHint.style.display = chats.length ? "none" : "";
  }

  el.history.innerHTML = chats.map(chat => `
    <div class="history-row ${chat.id === activeChatId ? "active" : ""}" role="listitem">
      <button type="button" class="history-item"
        data-chat-id="${escapeHTML(chat.id)}"
        title="${escapeHTML(chat.title)}"
        ${chat.id === activeChatId ? 'aria-current="true"' : ""}>
        <span class="history-icon" aria-hidden="true">◷</span>
        <span class="history-title">${escapeHTML(chat.title)}</span>
      </button>
      <button type="button" class="history-delete"
        data-delete-id="${escapeHTML(chat.id)}"
        aria-label="Sohbeti sil" title="Sohbeti sil">×</button>
    </div>
  `).join("");
}

function renderMessages() {
  if (!el.messages) return;

  const chat = getActiveChat();

  if (!chat || (!chat.messages.length && !busy)) {
    el.messages.innerHTML = `
      <div class="welcome">
        <div class="welcome-icon">✦</div>
        <h1>Merhaba, ben NOVA.</h1>
        <p>Bugün sana nasıl yardımcı olabilirim?</p>
        <div class="nova-quick-actions">
          <button type="button" data-prompt="Bana yeni fikirler öner.">✦ Fikir üret</button>
          <button type="button" data-prompt="/oyun">🎮 Mini oyunlar</button>
          <button type="button" data-prompt="/ara Bugünün önemli teknoloji haberleri">🌐 İnternette araştır</button>
        </div>
      </div>
    `;
    return;
  }

  const lastIndex = chat.messages.length - 1;

  let html = chat.messages.map((message, index) => {
    const isUser = message.role === "user";
    const classes = [
      "message",
      isUser ? "user-message" : "assistant-message"
    ];

    if (message.error) classes.push("error-message");

    let actions = "";

    if (!isUser && !message.error) {
      actions += `<button type="button" data-copy-index="${index}">Kopyala</button>`;
    }

    if (!isUser && index === lastIndex && !busy) {
      actions += `<button type="button" data-retry-index="${index}">Yeniden dene</button>`;
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

  el.status.innerHTML =
    `<i aria-hidden="true"></i><span>${escapeHTML(message)}</span>`;

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
  el.count.textContent = length > 3000
    ? `${length} / ${MAX_LENGTH}`
    : "";
}

function resizePrompt() {
  if (!el.prompt) return;

  el.prompt.style.height = "auto";
  el.prompt.style.height = `${Math.min(el.prompt.scrollHeight, 180)}px`;
}

function createChat() {
  if (busy) return;

  const empty = chats.find(c => c.messages.length === 0);

  if (empty) {
    activeChatId = empty.id;
  } else {
    const now = Date.now();
    const chat = {
      id: createId(),
      title: "Yeni sohbet",
      messages: [],
      createdAt: now,
      updatedAt: now
    };

    chats.unshift(chat);
    activeChatId = chat.id;
  }

  saveChats();
  renderHistory();
  renderMessages();
  closeSidebar();
  el.prompt?.focus();
}

function openChat(id) {
  if (busy || !chats.some(c => c.id === id)) return;

  activeChatId = id;
  renderHistory();
  renderMessages();
  closeSidebar();
}

function deleteChat(id) {
  if (busy || !chats.some(c => c.id === id)) return;
  if (!confirm("Bu sohbet silinsin mi?")) return;

  chats = chats.filter(c => c.id !== id);

  if (activeChatId === id) {
    activeChatId = chats[0]?.id ?? null;
  }

  saveChats();
  renderHistory();
  renderMessages();
}

function addMessage(role, content, { chat = getActiveChat(), error = false } = {}) {
  if (!chat) return;

  const message = { role, content: String(content) };
  if (error) message.error = true;

  chat.messages.push(message);
  chat.updatedAt = Date.now();

  if (role === "user" && chat.title === "Yeni sohbet") {
    chat.title = content.replace(/\s+/g, " ").trim().slice(0, 35) || "Yeni sohbet";
  }

  saveChats();
  renderHistory();

  if (chat.id === activeChatId) renderMessages();
}

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

async function postJSON(url, body, signal) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error ||
      data.message ||
      `Sunucu hatası (${response.status})`
    );
  }

  return data;
}

async function requestAssistant({ research = false } = {}) {
  const chat = getActiveChat();
  if (!chat || busy) return;

  const last = chat.messages[chat.messages.length - 1];
  if (!last || last.role !== "user") return;

  const thisRequest = ++requestId;
  setBusy(true);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  let failure = null;

  try {
    const endpoint = research ? "/api/research" : "/api/chat";

    const data = await postJSON(endpoint, {
      messages: buildPayload(chat),
      query: last.content
    }, controller.signal);

    if (thisRequest !== requestId) return;

    const reply = data.reply ?? data.text ?? data.message;

    if (typeof reply !== "string" || !reply.trim()) {
      throw new Error("NOVA boş yanıt döndürdü.");
    }

    let finalReply = reply.trim();

    // Araştırma API'si sources dizisi döndürürse kaynakları ekle.
    if (research && Array.isArray(data.sources) && data.sources.length) {
      const sourceText = data.sources
        .filter(s => s && typeof s.url === "string" && /^https?:\/\//i.test(s.url))
        .slice(0, 8)
        .map((s, i) => `${i + 1}. [${String(s.title || s.url).slice(0, 150)}](${s.url})`)
        .join("\n");

      if (sourceText) finalReply += `\n\n### Kaynaklar\n${sourceText}`;
    }

    addMessage("assistant", finalReply, { chat });
  } catch (error) {
    if (thisRequest !== requestId) return;

    failure = "Bağlantı hatası";
    let message = error.message || "Beklenmeyen bir hata oluştu.";

    if (error.name === "AbortError") {
      failure = "Zaman aşımı";
      message = "İstek zaman aşımına uğradı. Tekrar deneyebilirsin.";
    } else if (error instanceof TypeError) {
      message = research
        ? "Araştırma servisine ulaşılamadı. Sunucuda /api/research endpoint'i tanımlı mı?"
        : "Sunucuya ulaşılamadı. İnternet bağlantını ve sunucunun çalıştığını kontrol et.";
    }

    addMessage("assistant", message, { chat, error: true });
  } finally {
    clearTimeout(timeout);

    if (thisRequest === requestId) {
      setBusy(false, failure);
    }
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
  const text = String(content).trim();
  if (!text || busy) return;

  if (text.length > MAX_LENGTH) {
    alert(`Mesaj en fazla ${MAX_LENGTH} karakter olabilir.`);
    return;
  }

  if (!getActiveChat()) createChat();

  // Mini oyunlar sunucuya istek göndermeden çalışır.
  if (handleLocalCommand(text)) {
    if (el.prompt) el.prompt.value = "";
    resizePrompt();
    updateCount();
    return;
  }

  const research = /^\/ara(?:\s|$)/i.test(text);
  const actualText = research ? text.replace(/^\/ara\s*/i, "").trim() : text;

  if (!actualText) {
    addMessage("assistant", "Araştırmak istediğin konuyu `/ara konu` biçiminde yaz.");
    return;
  }

  addMessage("user", research ? `🌐 Araştır: ${actualText}` : actualText);

  if (el.prompt) el.prompt.value = "";
  resizePrompt();
  updateCount();

  requestAssistant({ research });
}

/* ---------- Mini oyunlar ---------- */

function gameReply(userText, result) {
  if (!getActiveChat()) createChat();

  addMessage("user", userText);
  addMessage("assistant", result);
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function handleLocalCommand(text) {
  const command = text.trim().toLowerCase();

  if (command === "/oyun" || command === "/oyunlar") {
    gameReply(text,
      "## 🎮 NOVA Mini Oyun Merkezi\n\n" +
      "- `/yazitura` — Yazı tura at\n" +
      "- `/zar` — Zar at\n" +
      "- `/rps taş` — Taş-kâğıt-makas oyna\n" +
      "- `/tahmin` — 1–100 arasında sayı tahmin et\n" +
      "- `/matematik` — Hızlı matematik sorusu\n" +
      "- `/secenek A, B, C` — Rastgele seçenek seç\n\n" +
      "Komutlardan birini yazıp gönder!"
    );
    return true;
  }

  if (command === "/yazitura" || command === "/yazı tura") {
    gameReply(text, Math.random() < 0.5 ? "🪙 Sonuç: **YAZI!**" : "🪙 Sonuç: **TURA!**");
    return true;
  }

  if (command === "/zar") {
    const die = randomInt(1, 6);
    gameReply(text, `🎲 Zar sonucu: **${die}**`);
    return true;
  }

  if (command.startsWith("/rps")) {
    const choice = command.replace(/^\/rps\s*/, "");
    const choices = ["taş", "kâğıt", "makas"];

    if (!choices.includes(choice)) {
      gameReply(text, "Taş-kâğıt-makas için `/rps taş`, `/rps kâğıt` veya `/rps makas` yaz.");
      return true;
    }

    const bot = choices[randomInt(0, 2)];
    let result = choice === bot
      ? "Berabere! 🤝"
      : (
        (choice === "taş" && bot === "makas") ||
        (choice === "kâğıt" && bot === "taş") ||
        (choice === "makas" && bot === "kâğıt")
      ) ? "Kazandın! 🎉" : "Bu turu ben kazandım! 😄";

    gameReply(text, `Sen: **${choice}**\n\nNOVA: **${bot}**\n\n${result}`);
    return true;
  }

  if (command === "/tahmin") {
    const number = randomInt(1, 100);
    gameReply(text,
      `🔢 Aklımdan 1 ile 100 arasında bir sayı tuttum. Bu turdaki sayı **${number}**.\n\n` +
      "Bu basit sürümde sayı doğrudan gösterilir; sonraki geliştirmede tahminleri takip eden gerçek bir oyun arayüzü ekleyebiliriz."
    );
    return true;
  }

  if (command === "/matematik") {
    const a = randomInt(2, 30);
    const b = randomInt(2, 30);
    const op = randomInt(0, 1) ? "+" : "×";
    const answer = op === "+" ? a + b : a * b;

    gameReply(text,
      `🧠 **Hızlı matematik:** ${a} ${op} ${b} = ?\n\nCevap: **${answer}**`
    );
    return true;
  }

  if (command.startsWith("/secenek ")) {
    const options = text.slice(9).split(",").map(s => s.trim()).filter(Boolean);

    if (options.length < 2) {
      gameReply(text, "En az iki seçenek yaz. Örnek: `/secenek pizza, hamburger, döner`");
    } else {
      gameReply(text, `🎯 NOVA'nın seçimi: **${options[randomInt(0, options.length - 1)]}**`);
    }
    return true;
  }

  return false;
}

/* ---------- Menü ve dışa aktarma ---------- */

function closeSidebar() {
  el.layout?.classList.remove("sidebar-open");
  el.menu?.setAttribute("aria-expanded", "false");
}

function toggleSidebar() {
  const open = el.layout?.classList.toggle("sidebar-open");
  el.menu?.setAttribute("aria-expanded", String(Boolean(open)));
}

function downloadText(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatMessages(messages) {
  return messages
    .filter(m => !m.error)
    .map(m => `${m.role === "user" ? "Sen" : "NOVA AI"}:\n${m.content}`)
    .join("\n\n--------------------\n\n");
}

function exportChat() {
  const chat = getActiveChat();
  if (chat) downloadText(`${chat.title || "nova-sohbet"}.txt`, formatMessages(chat.messages));
}

function exportAllChats() {
  const content = chats
    .map(chat => `# ${chat.title}\n\n${formatMessages(chat.messages)}`)
    .join("\n\n====================\n\n");

  downloadText("nova-tum-sohbetler.txt", content);
}

/* ---------- Olaylar ---------- */

el.newChat?.addEventListener("click", createChat);
el.menu?.addEventListener("click", toggleSidebar);
el.scrim?.addEventListener("click", closeSidebar);

if (el.form) el.form.noValidate = true;

el.form?.addEventListener("submit", event => {
  event.preventDefault();
  sendMessage(el.prompt?.value || "");
});

el.prompt?.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    el.form?.requestSubmit();
  }
});

el.prompt?.addEventListener("input", () => {
  resizePrompt();
  updateCount();
});

el.history?.addEventListener("click", event => {
  const remove = event.target.closest("[data-delete-id]");
  if (remove) return deleteChat(remove.dataset.deleteId);

  const open = event.target.closest("[data-chat-id]");
  if (open) openChat(open.dataset.chatId);
});

el.messages?.addEventListener("click", async event => {
  const quick = event.target.closest("[data-prompt]");
  if (quick) {
    sendMessage(quick.dataset.prompt);
    return;
  }

  const copy = event.target.closest("[data-copy-index]");

  if (copy) {
    const message = getActiveChat()?.messages[Number(copy.dataset.copyIndex)];
    if (!message) return;

    try {
      await navigator.clipboard.writeText(message.content);
      copy.textContent = "Kopyalandı ✓";
      setTimeout(() => {
        if (copy.isConnected) copy.textContent = "Kopyala";
      }, 1500);
    } catch {
      alert("Kopyalama başarısız oldu. Metni seçip kopyalayabilirsin.");
    }
    return;
  }

  const retry = event.target.closest("[data-retry-index]");
  if (retry) retryAnswer(Number(retry.dataset.retryIndex));
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeSidebar();

  const active = document.activeElement;
  const typing = active && (
    active.tagName === "TEXTAREA" ||
    active.tagName === "INPUT" ||
    active.isContentEditable
  );

  if (
    !typing &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    event.key.toLowerCase() === "n"
  ) {
    event.preventDefault();
    createChat();
  }
});

window.NOVA = {
  newChat: createChat,
  exportChat,
  exportAllChats,
  research: query => sendMessage(`/ara ${query}`),
  games: () => sendMessage("/oyun"),
};

renderHistory();
renderMessages();
updateCount();
resizePrompt();
