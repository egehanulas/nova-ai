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
  fetchPinnedUrl,
  readLimitedBody,
  getSeedSources,
  hasRelevantTopicEvidence,
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
  assert.equal(isPrivateAddress("2001:db8::1"), true);
  assert.equal(isPrivateAddress("2001:1::1"), true);
  assert.equal(isPrivateAddress("2002:0808:0808::1"), true);
  assert.equal(isPrivateAddress("::ffff:127.0.0.1"), true);
  assert.equal(isPrivateAddress("::ffff:8.8.8.8"), false);
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

test("NVIDIA OpenShell research adds official first-party seed sources", () => {
  const sources = getSeedSources("NVIDIA OpenShell kapsamlı teknik araştırma");
  assert.equal(sources.length, 2);
  assert.equal(sources[0].url, "https://www.nvidia.com/en-us/ai/openshell/");
  assert.equal(sources[1].url, "https://github.com/NVIDIA/OpenShell");
});

test("OpenShell research requires evidence that actually mentions the requested project", () => {
  assert.equal(hasRelevantTopicEvidence("NVIDIA OpenShell nedir?", [
    { title: "NVIDIA news", url: "https://nvidia.com/news", content: "NVIDIA announced a new GPU." },
  ]), false);
  assert.equal(hasRelevantTopicEvidence("NVIDIA OpenShell nedir?", [
    { title: "NVIDIA OpenShell", url: "https://github.com/NVIDIA/OpenShell", content: "OpenShell runtime. ".repeat(12) },
  ]), true);
  assert.equal(hasRelevantTopicEvidence("NVIDIA OpenShell nedir?", [
    { title: "NVIDIA OpenShell", url: "https://github.com/NVIDIA/OpenShell", content: "" },
  ]), false);
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


test("response reader enforces the byte limit while streaming", async () => {
  assert.equal(await readLimitedBody(new Response("NOVA"), 4), "NOVA");
  await assert.rejects(
    readLimitedBody(new Response("🌍"), 3),
    /Sayfa boyutu güvenli okuma sınırını aşıyor/
  );
});


test("URL validation rejects a hostname when any resolved address is private", async () => {
  const dns = require("node:dns").promises;
  const originalLookup = dns.lookup;
  dns.lookup = async () => [
    { address: "8.8.8.8", family: 4 },
    { address: "10.0.0.8", family: 4 },
  ];
  try {
    await assert.rejects(
      validatePublicUrl("https://rebinding.example/private"),
      /özel veya güvenilmeyen bir ağ adresine/
    );
  } finally {
    dns.lookup = originalLookup;
  }
});

test("URL validation retains the exact public DNS answers used for the connection", async () => {
  const dns = require("node:dns").promises;
  const originalLookup = dns.lookup;
  const answers = [
    { address: "8.8.8.8", family: 4 },
    { address: "2606:4700:4700::1111", family: 6 },
  ];
  dns.lookup = async () => answers;
  try {
    const url = await validatePublicUrl("https://pinned.example/article");
    assert.deepEqual(url.resolvedAddresses, answers);
  } finally {
    dns.lookup = originalLookup;
  }
});


test("page connection uses validated DNS answers without resolving the hostname again", async () => {
  const dns = require("node:dns").promises;
  const https = require("node:https");
  const { Readable } = require("node:stream");
  const originalLookup = dns.lookup;
  const originalRequest = https.request;
  const approved = [{ address: "8.8.8.8", family: 4 }];
  let connectionLookup;
  dns.lookup = async () => approved;
  https.request = (_url, options, callback) => {
    connectionLookup = options.lookup;
    const request = {
      once() { return this; },
      end() {
        const incoming = Readable.from(["pinned"]);
        incoming.statusCode = 200;
        incoming.statusMessage = "OK";
        incoming.headers = { "content-type": "text/plain" };
        callback(incoming);
      },
    };
    return request;
  };
  try {
    const url = await validatePublicUrl("https://pinned.example/article");
    dns.lookup = async () => [{ address: "127.0.0.1", family: 4 }];
    const response = await fetchPinnedUrl(url);
    const connected = await new Promise((resolve, reject) => {
      connectionLookup("pinned.example", {}, (error, address, family) => {
        if (error) reject(error);
        else resolve({ address, family });
      });
    });
    assert.deepEqual(connected, approved[0]);
    assert.equal(await response.text(), "pinned");
  } finally {
    dns.lookup = originalLookup;
    https.request = originalRequest;
  }
});
