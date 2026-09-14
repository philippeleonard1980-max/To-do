import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { slugify, usernameFromEmail } from "../src/lib/slug";
import { parseJson, stringifyJson } from "../src/lib/json";
import { getModel, planAllowsModel, planInfo, PLAN_LIMITS } from "../src/lib/constants";
import { normalizeSettings, DEFAULT_SETTINGS } from "../src/lib/settings";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    assert.equal(slugify("Slow Burn"), "slow-burn");
  });

  it("strips accents and punctuation", () => {
    assert.equal(slugify("Café Noir!"), "cafe-noir");
  });

  it("never returns an empty string", () => {
    assert.equal(slugify("!!!", "fallback"), "fallback");
  });

  it("derives a username from an email local part", () => {
    assert.equal(usernameFromEmail("Ada.Lovelace@example.com"), "ada-lovelace");
  });
});

describe("json helpers", () => {
  it("merges stored values over defaults", () => {
    assert.deepEqual(parseJson('{"a":2}', { a: 1, b: 3 }), { a: 2, b: 3 });
  });

  it("falls back on corrupt rows instead of throwing", () => {
    assert.deepEqual(parseJson("{not json", { a: 1 }), { a: 1 });
    assert.deepEqual(parseJson(null, { a: 1 }), { a: 1 });
  });

  it("ignores non-object JSON", () => {
    assert.deepEqual(parseJson("[1,2]", { a: 1 }), { a: 1 });
  });

  it("round-trips", () => {
    assert.deepEqual(parseJson(stringifyJson({ a: 5 }), { a: 1 }), { a: 5 });
  });
});

describe("plan gating", () => {
  it("keeps Opus behind a paid tier", () => {
    assert.equal(planAllowsModel("free", "claude-opus-5"), false);
    assert.equal(planAllowsModel("plus", "claude-opus-5"), true);
    assert.equal(planAllowsModel("pro", "claude-opus-5"), true);
  });

  it("allows the standard models on every tier", () => {
    assert.equal(planAllowsModel("free", "claude-sonnet-5"), true);
    assert.equal(planAllowsModel("free", "claude-haiku-4-5-20251001"), true);
  });

  it("falls back to the default model for unknown ids", () => {
    assert.equal(getModel("not-a-model").id, getModel(undefined).id);
  });

  it("raises limits monotonically across tiers", () => {
    assert.ok(PLAN_LIMITS.plus.groupSize > PLAN_LIMITS.free.groupSize);
    assert.ok(PLAN_LIMITS.pro.memoryTurns > PLAN_LIMITS.plus.memoryTurns);
    assert.ok(planInfo("pro").credits > planInfo("free").credits);
  });
});

describe("normalizeSettings", () => {
  it("returns defaults for empty input", () => {
    assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
  });

  it("clamps an out-of-range temperature", () => {
    assert.equal(normalizeSettings('{"temperature":9}').temperature, 1.5);
    assert.equal(normalizeSettings('{"temperature":-4}').temperature, 0);
  });

  it("rejects an unknown response length", () => {
    assert.equal(normalizeSettings('{"responseLength":"epic"}').responseLength, DEFAULT_SETTINGS.responseLength);
  });

  it("rejects an unknown theme", () => {
    assert.equal(normalizeSettings('{"theme":"neon"}').theme, "dark");
  });

  it("keeps valid values", () => {
    const settings = normalizeSettings('{"responseLength":"long","theme":"light","showMature":true}');
    assert.equal(settings.responseLength, "long");
    assert.equal(settings.theme, "light");
    assert.equal(settings.showMature, true);
  });
});
