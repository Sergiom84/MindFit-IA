import test from "node:test";
import assert from "node:assert/strict";

import {
  getFeatureEnvKey,
  resolveApiKeyForFeature
} from "../lib/openaiClient.js";

const ORIGINAL_ENV = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY
};

test.after(() => {
  process.env.OPENAI_API_KEY = ORIGINAL_ENV.OPENAI_API_KEY;
});

test("openaiClient: nutrition usa la key unificada OPENAI_API_KEY", () => {
  assert.equal(getFeatureEnvKey("nutrition"), "OPENAI_API_KEY");
});

test("openaiClient: nutrition resuelve con OPENAI_API_KEY", () => {
  process.env.OPENAI_API_KEY = "unified-key";

  const resolution = resolveApiKeyForFeature("nutrition");

  assert.equal(resolution.key, "unified-key");
  assert.equal(resolution.source, "OPENAI_API_KEY");
  assert.equal(resolution.fallbackUsed, false);
});

test("openaiClient: nutrition sin key configurada devuelve null (no estricto)", () => {
  delete process.env.OPENAI_API_KEY;

  const resolution = resolveApiKeyForFeature("nutrition");

  assert.equal(resolution.key, null);
  assert.equal(resolution.strict, false);
});
