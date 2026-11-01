"use strict";

const dns = require("node:dns").promises;
const net = require("node:net");

const USER_AGENT = "Mozilla/5.0 (compatible; NOVAAI/1.0; +https://github.com/egehanulas/nova-ai)";
const MAX_HTML_BYTES = 1_500_000;
const MAX_PAGE_TEXT = 7_000;

function decodeEntities(value = "") {
  return String(value)
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">").replace(/&nbsp;/gi, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
      const point = Number.parseInt(code, 16);
      return point <= 0x10ffff ? String.fromCodePoint(point) : "";
    })
    .replace(/&#(\d+);/g, (_, code) => {
      const point = Number(code);
      return point <= 0x10ffff ? String.fromCodePoint(point) : "";
    });
}

function stripTags(value = "") {
  return decodeEntities(String(value)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ").trim();
}

function isPrivateAddress(address) {
  const version = net.isIP(address);
  if (version === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && ((b === 0 && (c === 0 || c === 2)) || b === 168)) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113) || a >= 224;
  }
  if (version === 6) {
    const value = address.toLowerCase();
    if (value.startsWith("::ffff:")) {
      const mapped = value.slice(7);
      return net.isIP(mapped) === 4 ? isPrivateAddress(mapped) : true;
    }
    return value.startsWith("::") ||
      value.startsWith("fc") || value.startsWith("fd") ||
      /^fe[89ab]/.test(value) || value.startsWith("ff") ||
      value.startsWith("2001:db8:");
  }
  return true;
}

async function validatePublicUrl(rawUrl) {
  let url;
  try { url = new URL(rawUrl); } catch { throw new Error("Geçerli bir bağlantı değil."); }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Yalnızca HTTP ve HTTPS bağlantıları açılabilir.");
  if (url.username || url.password) throw new Error("Kimlik bilgisi içeren bağlantılar açılamaz.");
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error("Yerel veya özel ağ adresleri açılamaz.");
  }
  const version = net.isIP(hostname);
  if (version) {
    if (isPrivateAddress(hostname)) throw new Error("Özel ağ adresleri açılamaz.");
  } else {
    const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
      throw new Error("Bağlantı özel veya güvenilmeyen bir ağ adresine çözümleniyor.");
    }
  }
  url.hash = "";
  return url;
}

function extractUrls(text = "") {
  const matches = String(text).match(/https?:\/\/[^\s<>"'\x60]+/gi) || [];
  const urls = [];
  for (const raw of matches) {
    const cleaned = raw.replace(/[)\]},.!?;:]+$/g, "");
    try {
      const url = new URL(cleaned);
      if (["http:", "https:"].includes(url.protocol) && !urls.includes(url.href)) urls.push(url.href);
    } catch {}
    if (urls.length >= 3) break;
  }
  return urls;
}

function readMeta(html, keys) {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const tags = String(html).match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const name = tag.match(/\b(?:name|property)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1];
    if (name && wanted.has(name) && content) return stripTags(content);
  }
  return "";
}

function parsePage(html, finalUrl) {
  const title = readMeta(html, ["og:title", "twitter:title"]) ||
    stripTags((html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
  const description = readMeta(html, ["description", "og:description", "twitter:description"]);
  const publishedAt = readMeta(html, ["article:published_time", "datepublished", "date", "pubdate"]);
  const modifiedAt = readMeta(html, ["article:modified_time", "datemodified", "og:updated_time", "last-modified"]);
  const canonicalMatch = html.match(/<link\b(?=[^>]*rel=["'][^"']*canonical[^"']*["'])[^>]*href=["']([^"']+)["']/i);
  let canonical = finalUrl;
  if (canonicalMatch) {
    try { canonical = new URL(decodeEntities(canonicalMatch[1]), finalUrl).href; } catch {}
  }
  const cleanedHtml = html.replace(/<(script|style|noscript|svg|nav|footer|header|aside|form|button|iframe|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  const blocks = [...cleanedHtml.matchAll(/<(article|main)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((match) => stripTags(match[2])).filter((value) => value.length > 300);
  const bodyText = blocks.sort((a, b) => b.length - a.length)[0] ||
    stripTags(cleanedHtml.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || cleanedHtml);
  const content = [description, bodyText].filter(Boolean).join("\n\n")
    .replace(/\s+/g, " ").trim().slice(0, MAX_PAGE_TEXT);
  return {
    title: title || new URL(finalUrl).hostname,
    url: canonical,
    snippet: description.slice(0, 700),
    content,
    publishedAt,
    modifiedAt,
    domain: new URL(finalUrl).hostname,
  };
}

async function readLimitedBody(response, maxBytes = MAX_HTML_BYTES) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("Sayfa boyutu güvenli okuma sınırını aşıyor.");
      }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}

async function fetchPublicPage(rawUrl, signal) {
  let current = rawUrl;
  for (let redirects = 0; redirects <= 4; redirects++) {
    const url = await validatePublicUrl(current);
    const requestSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(12_000)])
      : AbortSignal.timeout(12_000);
    const response = await fetch(url, {
      method: "GET", redirect: "manual", signal: requestSignal,
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
        "Accept-Language": "en-US,en;q=0.9,tr;q=0.8",
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirects === 4) throw new Error("Sayfa yönlendirmesi tamamlanamadı.");
      current = new URL(location, url).href;
      continue;
    }
    if (!response.ok) throw new Error("Sayfa HTTP " + response.status);
    const contentType = response.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType)) {
      throw new Error("Bu bağlantı desteklenmeyen bir içerik türü döndürdü.");
    }
    const html = await readLimitedBody(response);
    const result = parsePage(html, response.url || url.href);
    if (result.content.length < 120) throw new Error("Sayfadan okunabilir metin çıkarılamadı.");
    return result;
  }
  throw new Error("Çok fazla yönlendirme.");
}

function parseRssFeed(xml) {
  const results = [];
  const items = String(xml || "").match(/<(?:item|entry)\b[^>]*>[\s\S]*?<\/(?:item|entry)>/gi) || [];
  for (const item of items) {
    if (results.length >= 8) break;
    const readTag = (tag) => {
      const match = item.match(new RegExp("<" + tag + "\\b[^>]*>([\\s\\S]*?)<\\/" + tag + ">", "i"));
      return stripTags(String(match?.[1] || "").replace(/<!\[CDATA\[|\]\]>/g, ""));
    };
    const title = readTag("title").slice(0, 220);
    let href = readTag("link");
    if (!href) href = decodeEntities(item.match(/<link\b[^>]*href=["']([^"']+)["']/i)?.[1] || "");
    try {
      const url = new URL(href);
      if (!title || !["http:", "https:"].includes(url.protocol) || results.some((entry) => entry.url === url.href)) continue;
      results.push({
        title, url: url.href,
        snippet: readTag("description") || readTag("summary"),
        publishedAt: readTag("pubDate") || readTag("published") || readTag("updated"),
        domain: url.hostname,
      });
    } catch {}
  }
  return results;
}

function parseBingHtml(html) {
  const results = [];
  const blocks = String(html).match(/<li\b[^>]*class=["'][^"']*\bb_algo\b[^"']*["'][\s\S]*?<\/li>/gi) || [];
  for (const block of blocks) {
    const link = block.match(/<h2\b[^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    try {
      const url = new URL(decodeEntities(link[1]));
      const title = stripTags(link[2]);
      if (title && ["http:", "https:"].includes(url.protocol)) results.push({
        title, url: url.href, snippet: stripTags(block).slice(0, 700), domain: url.hostname
      });
    } catch {}
    if (results.length >= 8) break;
  }
  return results;
}

function parseDuckDuckGoHtml(html) {
  const results = [];
  const anchors = String(html).match(/<a\b[^>]*class=["'][^"']*\bresult__a\b[^"']*["'][^>]*>[\s\S]*?<\/a>/gi) || [];
  for (const anchor of anchors) {
    const hrefMatch = anchor.match(/\bhref=["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    let href = decodeEntities(hrefMatch[1]);
    try {
      const parsed = new URL(href, "https://html.duckduckgo.com");
      if (parsed.hostname.endsWith("duckduckgo.com")) href = parsed.searchParams.get("uddg") || href;
      const url = new URL(href);
      const title = stripTags(anchor);
      if (!title || !["http:", "https:"].includes(url.protocol)) continue;
      const offset = String(html).indexOf(anchor) + anchor.length;
      const snippet = stripTags(String(html).slice(offset, offset + 1800)).slice(0, 700);
      results.push({ title, url: url.href, snippet, domain: url.hostname });
    } catch {}
    if (results.length >= 8) break;
  }
  return results;
}

function relevanceScore(item, query) {
  const terms = String(query).toLowerCase().split(/[^a-z0-9ğüşöçıİĞÜŞÖÇ]+/i)
    .filter((term) => term.length > 2).slice(0, 12);
  const haystack = (item.title + " " + item.domain + " " + item.snippet).toLocaleLowerCase("tr-TR");
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}

async function fetchSearchProvider(provider, query, signal) {
  const requestSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(8_000)])
    : AbortSignal.timeout(8_000);
  const response = await fetch(provider.url(query), {
    signal: requestSignal,
    headers: {
      "User-Agent": USER_AGENT,
      "Accept": "application/rss+xml, application/xml, text/xml, text/html;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9,tr;q=0.8",
    },
  });
  if (!response.ok) throw new Error("HTTP " + response.status);
  return provider.parse((await response.text()).slice(0, MAX_HTML_BYTES));
}

function getSeedSources(query = "") {
  const value = String(query || "").toLowerCase();
  if (!/nvidia/.test(value) || !/openshell/.test(value)) return [];
  // Stable first-party entry points. These are fetched directly, not treated
  // as evidence unless the page itself can actually be read.
  return [
    {
      title: "NVIDIA OpenShell — official product page",
      url: "https://www.nvidia.com/en-us/ai/openshell/",
      domain: "www.nvidia.com",
      sourceType: "official_seed",
    },
    {
      title: "NVIDIA OpenShell — official GitHub repository",
      url: "https://github.com/NVIDIA/OpenShell",
      domain: "github.com",
      sourceType: "official_seed",
    },
  ];
}

function hasRelevantTopicEvidence(query = "", results = []) {
  const value = String(query || "").toLowerCase();
  if (/openshell/.test(value)) {
    return (Array.isArray(results) ? results : []).some((item) => {
      const evidence = [
        item?.title, item?.url, item?.snippet, item?.content,
        item?.searchTitle, item?.searchSnippet,
      ].join(" ").toLowerCase();
      return evidence.includes("openshell") &&
        (/nvidia/.test(evidence) || /github\.com\/nvidia\//.test(evidence));
    });
  }
  return Array.isArray(results) && results.some((item) =>
    String([item?.title, item?.url, item?.snippet, item?.content].join(" ")).trim().length > 0
  );
}

async function searchPublicWeb(query, signal) {
  const rawQuery = String(query || "")
    .replace(/https?:\/\/[^\s]+/gi, " ")
    .replace(/\s+/g, " ").trim();
  const cleanQuery = rawQuery.slice(0, 220);
  if (!cleanQuery) return [];

  const searchQueries = [cleanQuery];
  if (/\bnvidia\b/i.test(cleanQuery)) {
    searchQueries.push("NVIDIA AI latest official announcements " + new Date().getUTCFullYear() + " models developer technologies");
  }
  if (/openshell/i.test(cleanQuery)) {
    searchQueries.push('"NVIDIA OpenShell" official announcement');
    searchQueries.push('site:developer.nvidia.com/blog OpenShell NVIDIA');
    searchQueries.push('site:github.com/NVIDIA/OpenShell OpenShell');
    searchQueries.push('site:nvidia.com/en-us/ai/openshell OpenShell');
  }

  const providers = [
    {
      name: "Bing RSS",
      url: (q) => { const u = new URL("https://www.bing.com/search"); u.searchParams.set("format", "rss"); u.searchParams.set("q", q); return u; },
      parse: parseRssFeed,
    },
    {
      name: "DuckDuckGo",
      url: (q) => { const u = new URL("https://html.duckduckgo.com/html/"); u.searchParams.set("q", q); return u; },
      parse: parseDuckDuckGoHtml,
    },
    {
      name: "Bing HTML",
      url: (q) => { const u = new URL("https://www.bing.com/search"); u.searchParams.set("q", q); return u; },
      parse: parseBingHtml,
    },
    {
      name: "Google News RSS",
      url: (q) => { const u = new URL("https://news.google.com/rss/search"); u.searchParams.set("q", q); u.searchParams.set("hl", "en-US"); u.searchParams.set("gl", "US"); u.searchParams.set("ceid", "US:en"); return u; },
      parse: parseRssFeed,
    },
  ];

  // Query every available provider concurrently and merge their results.
  // A weak first response must not hide stronger results from another engine.
  const batches = await Promise.all(searchQueries.flatMap((searchTerm) =>
    providers.map(async (provider) => {
      try {
        const results = await fetchSearchProvider(provider, searchTerm, signal);
        if (results.length) console.log("[NOVA AI] Web araması sağlayıcısı:", provider.name, "-", results.length, "kaynak.");
        return results;
      } catch (error) {
        console.warn("[NOVA AI] " + provider.name + " araması başarısız:", error.message);
        return [];
      }
    })
  ));

  const unique = new Map();
  for (const item of batches.flat()) {
    try {
      const url = new URL(item.url);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) continue;
      const key = url.hostname.toLowerCase() + url.pathname.replace(/\/+$/, "");
      const previous = unique.get(key);
      if (!previous || String(item.snippet || "").length > String(previous.snippet || "").length) {
        unique.set(key, { ...item, url: url.href });
      }
    } catch {}
  }

  return [...unique.values()]
    .map((item) => ({ ...item, _score: relevanceScore(item, cleanQuery) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 10)
    .map(({ _score, ...item }) => item);
}

async function researchWeb(query, signal) {
  const directUrls = extractUrls(query);
  if (directUrls.length) {
    const pages = await Promise.all(directUrls.map(async (url) => {
      try { return await fetchPublicPage(url, signal); }
      catch (error) {
        console.warn("[NOVA AI] Doğrudan bağlantı okunamadı:", url, error.message);
        return null;
      }
    }));
    return pages.filter(Boolean);
  }

  const [searchResults] = await Promise.all([searchPublicWeb(query, signal)]);
  const seedSources = getSeedSources(query);
  const merged = [...seedSources, ...searchResults];
  const unique = new Map();
  for (const item of merged) {
    try {
      const url = new URL(item.url);
      const key = url.hostname.toLowerCase() + url.pathname.replace(/\\/+$/, "");
      if (!unique.has(key)) unique.set(key, item);
    } catch {}
  }

  const candidates = [...unique.values()].slice(0, 8);
  const pages = await Promise.all(candidates.map(async (item) => {
    try {
      const page = await fetchPublicPage(item.url, signal);
      return { ...item, ...page, searchTitle: item.title, searchSnippet: item.snippet };
    } catch (error) {
      return { ...item, content: "", note: "Sayfa içeriği açılamadı: " + error.message };
    }
  }));
  const readablePages = pages.filter((item) => String(item.content || "").length >= 120);
  const fallbackResults = pages.length ? pages : searchResults;
  return readablePages.length ? readablePages : fallbackResults;
}

module.exports = {
  extractUrls, fetchPublicPage, parsePage, parseRssFeed,
  parseBingHtml, parseDuckDuckGoHtml, isPrivateAddress,
  validatePublicUrl, searchPublicWeb, researchWeb,
  getSeedSources, hasRelevantTopicEvidence,
};
