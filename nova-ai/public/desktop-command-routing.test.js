import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("./desktop-command-routing.js", import.meta.url), "utf8");
const context = { window: {} };
vm.runInNewContext(source, context);
const route = context.window.NovaDesktopRouting.isLikelyDesktopCommand;

test("routes everyday app launches without Computer button", () => {
  for (const command of ["Hesap Makinesi'ni aç", "Windows Güvenliği'ni aç", "Discord'u aç", "Chrome'u aç"]) {
    assert.equal(route(command), true, command);
  }
});

test("routes multi-step browser and YouTube commands", () => {
  for (const command of [
    "Chrome'u aç, yeni sekme oluştur ve Google'da Fenerbahçe haberlerini ara",
    "YouTube'da Fenerbahçe maç özeti ara ve ilk videoyu aç",
    "İlk çıkan videoya tıkla ve oynat"
  ]) assert.equal(route(command), true, command);
});

test("routes Discord conversation and message tasks", () => {
  assert.equal(route("Discord'u aç, en son mesajlaştığım arkadaşımın sohbetini aç ve mesaj gönder"), true);
});

test("routes screen and mouse actions", () => {
  assert.equal(route("Fare imlecini ekranın sağ üst köşesine götür"), true);
  assert.equal(route("Ekranımı analiz et ve ne gördüğünü anlat"), true);
});

test("does not hijack ordinary questions and explanations", () => {
  for (const command of ["Discord nedir?", "Chrome neden açılmıyor?", "Bana Windows Güvenliği'ni anlat", "Sence YouTube mu Twitch mi?"]) {
    assert.equal(route(command), false, command);
  }
});

test("rejects empty and oversized input", () => {
  assert.equal(route(""), false);
  assert.equal(route("x".repeat(1201)), false);
});
