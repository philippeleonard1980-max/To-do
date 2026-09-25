import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";

import { getModel, planAllowsModel, MODELS } from "../src/lib/constants";
import { getProviderForModel, isMockProvider, resetProvider, configuredVendors } from "../src/lib/ai";

const saved = { ...process.env };

beforeEach(() => resetProvider());
afterEach(() => {
  process.env = { ...saved };
  resetProvider();
});

describe("model catalogue", () => {
  it("tags every model with a vendor", () => {
    for (const model of MODELS) {
      assert.ok(["anthropic", "gemini"].includes(model.vendor), `${model.id} -> ${model.vendor}`);
    }
  });

  it("includes both vendors", () => {
    const vendors = new Set(MODELS.map((m) => m.vendor));
    assert.ok(vendors.has("anthropic"));
    assert.ok(vendors.has("gemini"));
  });

  it("keeps the flagship models behind a paid tier", () => {
    assert.equal(planAllowsModel("free", "claude-opus-5"), false);
    assert.equal(planAllowsModel("free", "gemini-2.5-pro"), false);
    assert.equal(planAllowsModel("plus", "gemini-2.5-pro"), true);
  });

  it("offers a free-tier model from each vendor", () => {
    for (const vendor of ["anthropic", "gemini"] as const) {
      assert.ok(
        MODELS.some((m) => m.vendor === vendor && m.minPlan === "free"),
        `no free model for ${vendor}`,
      );
    }
  });
});

describe("provider routing", () => {
  it("falls back to the mock provider when a vendor has no key", () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.AI_PROVIDER;
    assert.equal(getProviderForModel("gemini-2.5-flash").name, "mock");
    assert.equal(getProviderForModel("claude-sonnet-5").name, "mock");
    assert.equal(isMockProvider(), true);
  });

  it("routes each model to its own vendor when keys exist", () => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic";
    process.env.GEMINI_API_KEY = "test-gemini";
    delete process.env.AI_PROVIDER;
    resetProvider();

    assert.equal(getProviderForModel("claude-sonnet-5").name, "anthropic");
    assert.equal(getProviderForModel("gemini-2.5-flash").name, "gemini");
    assert.equal(isMockProvider(), false);
  });

  it("routes only the configured vendor, leaving the other on mock", () => {
    process.env.GEMINI_API_KEY = "test-gemini";
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.AI_PROVIDER;
    resetProvider();

    assert.equal(getProviderForModel("gemini-2.5-flash").name, "gemini");
    assert.equal(getProviderForModel("claude-sonnet-5").name, "mock");
    // One vendor configured still counts as "not fully offline".
    assert.equal(isMockProvider(), false);
    assert.deepEqual(configuredVendors(), ["gemini"]);
  });

  it("AI_PROVIDER=mock overrides configured keys", () => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic";
    process.env.GEMINI_API_KEY = "test-gemini";
    process.env.AI_PROVIDER = "mock";
    resetProvider();

    assert.equal(getProviderForModel("claude-sonnet-5").name, "mock");
    assert.equal(getProviderForModel("gemini-2.5-flash").name, "mock");
    assert.deepEqual(configuredVendors(), []);
  });

  it("routes an unknown model id via the default model's vendor", () => {
    delete process.env.AI_PROVIDER;
    assert.equal(getModel("not-a-real-model").vendor, getModel(undefined).vendor);
  });
});
