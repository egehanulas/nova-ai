(() => {
  "use strict";
  const $ = (selector) => document.querySelector(selector);
  const tab = $("#developerTab");
  const list = $("#developerFeedbackList");
  const status = $("#developerFeedbackStatus");
  const refresh = $("#developerFeedbackRefresh");
  const states = { new: "Yeni", reviewing: "İnceleniyor", fixed: "Düzeltildi", closed: "Kapatıldı" };

  async function request(url, options = {}) {
    const { data, error } = await window.novaSupabase.auth.getSession();
    if (error) throw error;
    const token = data?.session?.access_token;
    if (!token) throw new Error("Oturum sona ermiş. Yeniden giriş yap.");
    const response = await fetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, ...(options.headers || {}) }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Geliştirici paneli isteği başarısız.");
    return result;
  }

  function render(items) {
    if (!list) return;
    list.replaceChildren();
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "feedback-intro";
      empty.textContent = "Henüz geri bildirim bulunmuyor.";
      list.append(empty);
      return;
    }
    for (const item of items) {
      const card = document.createElement("article");
      card.className = "developer-feedback-card";
      const heading = document.createElement("div");
      heading.className = "developer-feedback-header";
      const title = document.createElement("strong");
      title.textContent = item.ticket_code + " · " + String(item.feedback_type || "general");
      const date = document.createElement("time");
      date.textContent = item.created_at ? new Date(item.created_at).toLocaleString("tr-TR") : "";
      heading.append(title, date);
      const description = document.createElement("p");
      description.className = "developer-feedback-description";
      description.textContent = item.description || "";
      card.append(heading, description);
      if (item.include_diagnostics && item.diagnostics) {
        const details = document.createElement("details");
        const summary = document.createElement("summary");
        summary.textContent = "İsteğe bağlı teknik bilgiler";
        const pre = document.createElement("pre");
        pre.className = "developer-feedback-diagnostics";
        pre.textContent = JSON.stringify(item.diagnostics, null, 2);
        details.append(summary, pre);
        card.append(details);
      }
      const footer = document.createElement("div");
      footer.className = "developer-feedback-footer";
      const select = document.createElement("select");
      select.className = "developer-feedback-status";
      select.setAttribute("aria-label", item.ticket_code + " durumu");
      for (const [value, label] of Object.entries(states)) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        option.selected = item.status === value;
        select.append(option);
      }
      select.addEventListener("change", async () => {
        const previous = item.status;
        select.disabled = true;
        try {
          await request("/api/feedback/admin/" + encodeURIComponent(item.ticket_code), {
            method: "PATCH", body: JSON.stringify({ status: select.value })
          });
          item.status = select.value;
          if (status) status.textContent = item.ticket_code + " durumu kaydedildi.";
        } catch (error) {
          select.value = previous;
          if (status) status.textContent = error.message;
        } finally { select.disabled = false; }
      });
      footer.append(select);
      card.append(footer);
      list.append(card);
    }
  }

  async function load() {
    if (!list || !status) return;
    if (refresh) refresh.disabled = true;
    status.textContent = "Bildirimler yükleniyor…";
    try {
      const result = await request("/api/feedback/admin");
      const items = Array.isArray(result.feedback) ? result.feedback : [];
      render(items);
      status.textContent = items.length + " bildirim listelendi.";
    } catch (error) {
      list.replaceChildren();
      status.textContent = error.message;
    } finally { if (refresh) refresh.disabled = false; }
  }

  async function initialize() {
    const client = window.novaSupabase;
    if (!client) { if (status) status.textContent = "Oturum bağlantısı hazır değil."; return; }
    const { data, error } = await client.auth.getSession();
    if (error) { if (status) status.textContent = "Oturum denetlenemedi."; return; }
    const user = data?.session?.user;
    const isDeveloper = String(user?.email || "").trim().toLowerCase() === "egehanimat21@gmail.com" && Boolean(user?.email_confirmed_at || user?.confirmed_at);
    if (tab && isDeveloper) {
      tab.hidden = false;
      tab.addEventListener("click", load);
    }
  }

  refresh?.addEventListener("click", load);
  initialize().catch((error) => { if (status) status.textContent = error.message; });
})();
