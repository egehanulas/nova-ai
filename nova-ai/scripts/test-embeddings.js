#!/usr/bin/env node
"use strict";

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
const EXPECTED_DIMENSIONS = 384;

async function main() {
  const { pipeline, env } = await import("@huggingface/transformers");
  env.allowLocalModels = true;

  const extractor = await pipeline("feature-extraction", MODEL_ID, {
    dtype: "q8",
  });
  const output = await extractor("NOVA AI local embedding compatibility test", {
    pooling: "mean",
    normalize: true,
  });
  const values = output.tolist();
  const vector = Array.isArray(values?.[0]) ? values[0] : values;

  if (
    !Array.isArray(vector) ||
    vector.length !== EXPECTED_DIMENSIONS ||
    !vector.every(Number.isFinite)
  ) {
    throw new Error(
      `Embedding smoke test failed: expected ${EXPECTED_DIMENSIONS} finite values.`
    );
  }

  console.log(
    `Embedding smoke test passed: ${MODEL_ID}, ${vector.length} dimensions.`
  );
}

main().catch((error) => {
  console.error("Embedding smoke test failed:", error);
  process.exitCode = 1;
});
