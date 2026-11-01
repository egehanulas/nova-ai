"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  extractUrls,
  parsePage,
  parseRssFeed,
  parseBingHtml,
  parseDuckDuckGoHtml,
  isPrivateAddress,
  validatePublicUrl,
} = require("./web-research");

test("extractUrls finds direct links and removes sentence punctuation", () => {
  assert.deepEqual(
    extractUrls("Bu sayfayı oku: https://example.com/news?id=2. Sonra özetle."),
    ["https://example.com/news?id=2"]
  );
});

test("extractUrls deduplicates links and limits the number of pages", () => {
  assert.equal(
    extractUrls("https://a.example/ https://a.example/ https://b.example/ https://c.example/ https://d.example/").length,
    3
  );
});

test("private IPv4 and IPv6 ranges are rejected", () => {
  for (const ip of ["127.0.0.1", "10.0.0.1", "192.168.1.1", "169.254.1.1", "::1", "fc00::1", "fe80::1"]) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  assert.equal(isPrivateAddress("8.8.8.8"), false);
  assert.equal(isPrivateAddress("2606:4700:4700::1111"), false);
});

test("URL validator rejects localhost and private IPs", async () => {
  await assert.rejects(validatePublicUrl("http://localhost/admin"), /Yerel veya özel ağ/);
  await assert.rejects(validatePublicUrl("http://127.0.0.1/"), /Özel ağ/);
  await assert.rejects(validatePublicUrl("file:///etc/passwd"), /HTTP ve HTTPS/);
});

test("page parser extracts title, description and article body without scripts", () => {
  const html = [
    '<html><head><title>Fallback title</title>',
    '<meta property="og:title" content="Official Announcement">',
    '<meta name="description" content="Short description">',
    '<meta property="article:published_time" content="2026-10-21">',
    '</head><body><nav>Navigation</nav><article><h1>Official Announcement</h1>',
    '<p>This is the verified article body with enough readable words to pass the minimum content check.</p>',
    '<p>More technical details are included in this paragraph for extraction tests.</p>',
    '<script>secretDoNotInclude()</script></article></body></html>',
  ].join("");
  const page = parsePage(html, "https://example.com/news");
  assert.equal(page.title, "Official Announcement");
  assert.equal(page.publishedAt, "2026-10-21");
  assert.equal(page.modifiedAt, "");
  assert.match(page.content, /verified article body/);
  assert.doesNotMatch(page.content, /secretDoNotInclude|Navigation/);
});


test("page parser keeps publication date separate from modification date", () => {
  const html = '<html><head><meta property="article:published_time" content="2026-10-21">' +
    '<meta property="article:modified_time" content="2026-10-24T12:00:00Z">' +
    '</head><body><article><p>This article contains enough readable text to pass the minimum content check and validate date metadata extraction.</p></article></body></html>';
  const page = parsePage(html, "https://example.com/openshell");
  assert.equal(page.publishedAt, "2026-10-21");
  assert.equal(page.modifiedAt, "2026-10-24T12:00:00Z");
});

test("RSS parser extracts article title, link and publication date", () => {
  const xml = '<rss><channel><item><title>OpenShell announcement</title>' +
    '<link>https://developer.example.com/openshell</link>' +
    '<description>Reference architecture details</description>' +
    '<pubDate>Wed, 21 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>';
  const results = parseRssFeed(xml);
  assert.equal(results.length, 1);
  assert.equal(results[0].title, "OpenShell announcement");
  assert.equal(results[0].url, "https://developer.example.com/openshell");
  assert.match(results[0].publishedAt, /21 Oct 2026/);
});

test("Bing HTML parser extracts result links", () => {
  const html = '<ol><li class="b_algo"><h2><a href="https://example.com/a">Example result</a></h2><p>Useful result summary</p></li></ol>';
  const results = parseBingHtml(html);
  assert.equal(results.length, 1);
  assert.equal(results[0].title, "Example result");
});

test("DuckDuckGo parser extracts result links", () => {
  const html = '<a class="result__a" rel="nofollow" href="https://example.com/b">Another result</a>';
  const results = parseDuckDuckGoHtml(html);
  assert.equal(results.length, 1);
  assert.equal(results[0].url, "https://example.com/b");
});
