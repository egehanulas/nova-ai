(() => {
  "use strict";
  const openButton = document.getElementById("openNovaSim");
  const closeButton = document.getElementById("closeNovaSim");
  const simView = document.getElementById("novaSimView");
  const simFrame = document.getElementById("novaSimFrame");
  const settingsView = document.getElementById("settingsView");
  const messages = document.getElementById("messages");
  const composer = document.querySelector(".composer-area");
  const topTitle = document.getElementById("topTitleSection");
  if (!openButton || !closeButton || !simView || !simFrame || !messages || !composer) return;
  let previousTitle = "Sohbet";
  function showSim() {
    previousTitle = topTitle?.textContent || "Sohbet";
    if (settingsView) settingsView.hidden = true;
    messages.hidden = true;
    composer.hidden = true;
    simView.hidden = false;
    simView.style.display = "flex";
    if (simFrame.src === "about:blank") simFrame.src = simFrame.dataset.src || "/sim.html";
    if (topTitle) topTitle.textContent = "NOVA Sim";
    openButton.setAttribute("aria-current", "page");
  }
  function hideSim() {
    simView.hidden = true;
    simView.style.display = "none";
    messages.hidden = false;
    composer.hidden = false;
    if (topTitle) topTitle.textContent = previousTitle === "NOVA Sim" ? "Sohbet" : previousTitle;
    openButton.removeAttribute("aria-current");
  }
  openButton.addEventListener("click", showSim);
  closeButton.addEventListener("click", hideSim);
  window.addEventListener("message", event => {
    if (event.source === simFrame.contentWindow && event.data === "nova-sim:back") hideSim();
  });
})();
