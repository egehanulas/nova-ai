"use strict";

const assert = require("node:assert/strict");
const { researchWeb, searchPublicWeb } = require("../web-research");

async function main() {
  const signal = AbortSignal.timeout(30_000);
  const officialUrl = "https://nvidianews.nvidia.com/news/openshell-reference-architecture";

  const pages = await researchWeb(officialUrl, signal);
  assert.ok(pages.length > 0, "NVIDIA official page should be readable");
  assert.match(
    pages[0].title + " " + pages[0].content,
    /OpenShell/i,
    "Extracted page text should contain OpenShell"
  );
  assert.match(
    pages[0].content,
    /Reference Architecture/i,
    "Extracted page text should contain the announcement body"
  );
  console.log("PASS: NVIDIA official page fetched and article text extracted.");

  const results = await searchPublicWeb(
    '"NVIDIA OpenShell Reference Architecture" October 21 2026',
    signal
  );
  assert.ok(results.length > 0, "At least one public search provider should return results");
  assert.ok(
    results.some((item) => /openshell|nvidia/i.test(
      item.title + " " + item.domain + " " + item.snippet
    )),
    "Search results should be relevant to NVIDIA OpenShell"
  );
  console.log("PASS: public web search returned relevant NVIDIA OpenShell results.");
}

main().catch((error) => {
  console.error("Live web research test failed:", error.message);
  process.exitCode = 1;
});
