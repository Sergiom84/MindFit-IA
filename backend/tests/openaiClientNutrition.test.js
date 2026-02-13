import test from "node:test";
import assert from "node:assert/strict";

import {
  getFeatureEnvKey,
  resolveApiKeyForFeature
} from "../lib/openaiClient.js";

const ORIGINAL_ENV = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_API_KEY_NUTRITION: process.env.OPENAI_API_KEY_NUTRITION
};

test.after(() => {
  process.env.OPENAI_API_KEY = ORIGINAL_ENV.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY_NUTRITION = ORIGINAL_ENV.OPENAI_API_KEY_NUTRITION;
});

test("openaiClient: nutrition usa env key dedicada", () => {
  assert.equal(getFeatureEnvKey("nutrition"), "OPENAI_API_KEY_NUTRITION");
});

test("openaiClient: nutrition prioriza OPENAI_API_KEY_NUTRITION", () => {
  process.env.OPENAI_API_KEY = "fallback-key";
  process.env.OPENAI_API_KEY_NUTRITION = "nutrition-key";

  const resolution = resolveApiKeyForFeature("nutrition");

  assert.equal(resolution.key, "nutrition-key");
  assert.equal(resolution.source, "OPENAI_API_KEY_NUTRITION");
  assert.equal(resolution.fallbackUsed, false);
});

test("openaiClient: nutrition NO usa fallback cuando falta key dedicada", () => {
  process.env.OPENAI_API_KEY = "fallback-key";
  delete process.env.OPENAI_API_KEY_NUTRITION;

  const resolution = resolveApiKeyForFeature("nutrition");

  assert.equal(resolution.key, null);
  assert.equal(resolution.source, "OPENAI_API_KEY_NUTRITION");
  assert.equal(resolution.fallbackUsed, false);
  assert.equal(resolution.strict, true);
});
