import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

import {
  decryptSecret,
  encryptSecret,
  maskSecret,
  resetEncryptionKey,
} from "../src/lib/crypto";

// crypto.ts reads AUTH_SECRET lazily, inside encryptionKey(), so setting it
// here — after imports are hoisted but before any test body runs — is enough.
process.env.AUTH_SECRET ??= "test-secret-long-enough-for-scrypt-derivation";

beforeEach(() => resetEncryptionKey());

describe("secret encryption", () => {
  it("round-trips a key", () => {
    const key = "AIzaSyExampleKeyValue1234567890abcdef";
    assert.equal(decryptSecret(encryptSecret(key)), key);
  });

  it("never stores the plaintext", () => {
    const key = "sk-ant-secret-value-here";
    const stored = encryptSecret(key);
    assert.ok(!stored.includes(key));
    assert.ok(!stored.includes("secret-value"));
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const key = "same-key-every-time";
    assert.notEqual(encryptSecret(key), encryptSecret(key));
    // ...but both still decrypt.
    assert.equal(decryptSecret(encryptSecret(key)), key);
  });

  it("rejects a tampered ciphertext rather than returning garbage", () => {
    const stored = encryptSecret("original-key");
    const [iv, tag, data] = stored.split(".");
    const flipped = data.slice(0, -2) + (data.slice(-2) === "AA" ? "BB" : "AA");
    assert.equal(decryptSecret([iv, tag, flipped].join(".")), null);
  });

  it("returns null for malformed or empty input", () => {
    for (const bad of [null, undefined, "", "not-encrypted", "a.b", "a.b.c.d"]) {
      assert.equal(decryptSecret(bad as string | null), null);
    }
  });

  it("returns null when AUTH_SECRET changed, rather than throwing", () => {
    const stored = encryptSecret("key-under-old-secret");
    const original = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = "a-completely-different-secret-value-here";
    resetEncryptionKey();
    assert.equal(decryptSecret(stored), null);

    process.env.AUTH_SECRET = original;
    resetEncryptionKey();
    assert.equal(decryptSecret(stored), "key-under-old-secret");
  });
});

describe("maskSecret", () => {
  it("shows only the ends of a real key", () => {
    const masked = maskSecret("AIzaSyExampleKeyValue1234567890abcdef");
    assert.equal(masked, "AIza…cdef");
    assert.ok(!masked.includes("ExampleKeyValue"));
  });

  it("reveals nothing for a short value", () => {
    assert.equal(maskSecret("abc"), "•••");
    assert.ok(!maskSecret("12345678").includes("1234"));
  });
});
