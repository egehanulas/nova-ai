#!/usr/bin/env node
"use strict";

// NOVA AI — small, curated Unreal Engine 5.8 official-docs importer.
// Run from the nova-ai project directory: node scripts/ingest-knowledge.js
// Secrets are read only from environment variables and are never printed.

require("dotenv").config();

const crypto = require("node:crypto");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
const EMBEDDING_DIMENSIONS = 384;
let embeddingPipelinePromise;
const ENGINE_VERSION = "5.8";
const SOURCE_NAME = "Epic Developer Community — Unreal Engine Documentation";
const SOURCE_BASE_URL = "https://dev.epicgames.com/documentation/unreal-engine";
const SOURCE_TYPE = "official_docs";
const TRUST_LEVEL = 5;

// Begin with a deliberately small, curated set. Add URLs only after checking
// that they are official, relevant to UE 5.8, and permitted for this use.
const DOCUMENTS = [
  ["Introduction to Blueprints", "https://dev.epicgames.com/documentation/en-us/unreal-engine/introduction-to-blueprints-visual-scripting-in-unreal-engine"],
  ["Blueprint Basic User Guide", "https://dev.epicgames.com/documentation/en-us/unreal-engine/blueprint-basic-user-guide-in-unreal-engine"],
  ["Blueprints Quick Start Guide", "https://dev.epicgames.com/documentation/en-us/unreal-engine/quick-start-guide-for-blueprints-visual-scripting-in-unreal-engine"],
  ["Blueprint Best Practices", "https://dev.epicgames.com/documentation/en-us/unreal-engine/blueprint-best-practices-in-unreal-engine"],
  ["Blueprint Workflows", "https://dev.epicgames.com/documentation/en-us/unreal-engine/blueprint-workflows-in-unreal-engine"],
  ["Blueprint Foundations", "https://dev.epicgames.com/documentation/en-us/unreal-engine/blueprint-foundations"],
  ["Blueprints Technical Guide", "https://dev.epicgames.com/documentation/en-us/unreal-engine/technical-guide-for-blueprints-visual-scripting-in-unreal-engine"],
  ["Scripting the Unreal Editor using Blueprints", "https://dev.epicgames.com/documentation/en-us/unreal-engine/scripting-the-unreal-editor-using-blueprints"],
  ["Unreal Engine 5.8 Release Notes", "https://dev.epicgames.com/documentation/unreal-engine/unreal-engine-5-8-release-notes"],
];

function requiredEnv() {
  const missing = [];
  if (!SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length) {
    throw new Error("Eksik ortam değişkenleri: " + missing.join(", "));
  }
}

function decodeEntities(value) {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function htmlToText(html) {
  let value = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|header|footer|nav|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|\/p|\/div|\/section|\/article|\/h[1-6]|\/li|\/tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  value = decodeEntities(value);
  return value
    .replace(/[\t\r\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractDocument(html, fallbackTitle) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch
    ? htmlToText(titleMatch[1]).replace(/\s*\|\s*Unreal Engine.*/i, "").trim()
    : fallbackTitle;

  const mainMatch =
    html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i) ||
    html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const content = htmlToText((mainMatch || bodyMatch || [null, html])[1]);

  if (content.length < 500) {
    throw new Error("Sayfa metni çıkarılamadı veya beklenenden kısa.");
  }

  return { title: title || fallbackTitle, content };
}

function splitIntoChunks(text, maxChars = 3200) {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      if (current) chunks.push(current), (current = "");
      for (let i = 0; i < paragraph.length; i += maxChars) {
        const part = paragraph.slice(i, i + maxChars).trim();
        if (part.length >= 120) chunks.push(part);
      }
      continue;
    }

    if (current.length + paragraph.length + 2 > maxChars && current) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = current ? current + "\n\n" + paragraph : paragraph;
    }
  }

  if (current.length >= 120) chunks.push(current);
  return chunks;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error("Supabase HTTP " + response.status + ": " + body.slice(0, 500));
  }
  return body ? JSON.parse(body) : null;
}

async function getOrCreateSource() {
  const query = new URLSearchParams({
    select: "id",
    name: "eq." + SOURCE_NAME,
    limit: "1",
  });
  const found = await requestJson(SUPABASE_URL + "/rest/v1/knowledge_sources?" + query);
  if (found?.[0]?.id) return found[0].id;

  const created = await requestJson(SUPABASE_URL + "/rest/v1/knowledge_sources", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      name: SOURCE_NAME,
      source_type: SOURCE_TYPE,
      base_url: SOURCE_BASE_URL,
      trust_level: TRUST_LEVEL,
      license: "Epic Developer Community documentation — retain attribution and source URL; verify applicable terms before expanding ingestion.",
      enabled: true,
    }),
  });
  if (!created?.[0]?.id) throw new Error("Kaynak kaydı oluşturulamadı.");
  return created[0].id;
}

async function fetchOfficialPage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "NOVA-AI-KnowledgeIndexer/1.0 (official-docs index; contact: repository owner)",
        Accept: "text/html",
      },
    });
    if (!response.ok) throw new Error("Sayfa HTTP " + response.status);
    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/html")) throw new Error("Beklenmeyen içerik türü: " + type);
    const html = await response.text();
    if (html.length > 5_000_000) throw new Error("Sayfa boyutu güvenlik sınırını aştı.");
    return html;
  } finally {
    clearTimeout(timer);
  }
}

async function getEmbeddingPipeline() {
  if (!embeddingPipelinePromise) {
    embeddingPipelinePromise = (async () => {
      const { pipeline } = await import("@huggingface/transformers");
      return pipeline("feature-extraction", EMBEDDING_MODEL, { dtype: "q8" });
    })().catch((error) => {
      embeddingPipelinePromise = null;
      throw error;
    });
  }
  return embeddingPipelinePromise;
}

async function createEmbeddings(texts) {
  const extractor = await getEmbeddingPipeline();
  const output = await extractor(texts, { pooling: "mean", normalize: true });
  const vectors = output.tolist();
  if (!Array.isArray(vectors) || vectors.length !== texts.length) {
    throw new Error("Yerel model beklenmeyen embedding yanıtı döndürdü.");
  }
  return vectors.map((embedding) => {
    if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error("Yerel embedding boyutu 384 değil.");
    }
    return embedding;
  });
}

async function saveDocument(sourceId, title, url, content) {
  const hash = crypto.createHash("sha256").update(content).digest("hex");
  const existingQuery = new URLSearchParams({
    select: "id",
    canonical_url: "eq." + url,
    content_hash: "eq." + hash,
    limit: "1",
  });
  const existing = await requestJson(
    SUPABASE_URL + "/rest/v1/knowledge_documents?" + existingQuery
  );

  let documentId = existing?.[0]?.id;
  if (!documentId) {
    const created = await requestJson(SUPABASE_URL + "/rest/v1/knowledge_documents", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        source_id: sourceId,
        external_id: url,
        title,
        canonical_url: url,
        engine_version: ENGINE_VERSION,
        category: "Blueprint",
        topic: "Official Unreal Engine documentation",
        content_hash: hash,
        status: "published",
        metadata: { attribution: "Epic Developer Community", indexed_by: "NOVA AI" },
      }),
    });
    documentId = created?.[0]?.id;
  }

  if (!documentId) throw new Error("Doküman kaydı oluşturulamadı.");

  // Rebuild chunks for this exact document hash, making reruns idempotent.
  const deleteQuery = new URLSearchParams({ document_id: "eq." + documentId });
  await requestJson(SUPABASE_URL + "/rest/v1/knowledge_chunks_384?" + deleteQuery, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });

  const chunks = splitIntoChunks(content);
  if (!chunks.length) throw new Error("Dokümandan anlamlı metin parçaları üretilemedi.");

  for (let offset = 0; offset < chunks.length; offset += 16) {
    const batch = chunks.slice(offset, offset + 16);
    const vectors = await createEmbeddings(batch);
    const rows = batch.map((chunk, index) => ({
      document_id: documentId,
      chunk_index: offset + index,
      content: chunk,
      token_count: null,
      embedding: "[" + vectors[index].join(",") + "]",
      metadata: { engine_version: ENGINE_VERSION, source: "Epic Developer Community" },
    }));

    await requestJson(SUPABASE_URL + "/rest/v1/knowledge_chunks_384", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(rows),
    });
  }

  return chunks.length;
}

async function main() {
  requiredEnv();
  console.log("NOVA AI: Epic'in seçilmiş Unreal Engine 5.8 belgeleri aktarılıyor.");
  const sourceId = await getOrCreateSource();
  let success = 0;
  let failed = 0;
  let totalChunks = 0;

  for (const [fallbackTitle, url] of DOCUMENTS) {
    try {
      const html = await fetchOfficialPage(url);
      const document = extractDocument(html, fallbackTitle);
      const chunks = await saveDocument(sourceId, document.title, url, document.content);
      success += 1;
      totalChunks += chunks;
      console.log("OK:", document.title, "-", chunks, "parça");
    } catch (error) {
      failed += 1;
      console.error("ATLANDI:", fallbackTitle, "-", error.message);
    }
  }

  console.log("\nTamamlandı. Başarılı:", success, "| Hatalı/atlanan:", failed, "| Parça:", totalChunks);
  if (success === 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("Aktarım durduruldu:", error.message);
  process.exitCode = 1;
});
