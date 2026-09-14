import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeTurns } from "../src/lib/ai/anthropic";
import { MockProvider } from "../src/lib/ai/mock";

describe("normalizeTurns", () => {
  it("merges consecutive same-role turns", () => {
    const turns = normalizeTurns([
      { role: "user", content: "one" },
      { role: "user", content: "two" },
      { role: "assistant", content: "three" },
    ]);
    assert.deepEqual(turns, [
      { role: "user", content: "one\n\ntwo" },
      { role: "assistant", content: "three" },
    ]);
  });

  it("pads when the transcript would start with an assistant turn", () => {
    // Happens whenever a character greeting opens the chat.
    const turns = normalizeTurns([{ role: "assistant", content: "You're late." }]);
    assert.equal(turns[0].role, "user");
    assert.equal(turns[1].content, "You're late.");
  });

  it("drops empty turns", () => {
    const turns = normalizeTurns([
      { role: "user", content: "hi" },
      { role: "assistant", content: "   " },
    ]);
    assert.equal(turns.length, 1);
  });

  it("never returns an empty array", () => {
    assert.equal(normalizeTurns([]).length, 1);
  });

  it("always alternates roles", () => {
    const turns = normalizeTurns([
      { role: "assistant", content: "a" },
      { role: "assistant", content: "b" },
      { role: "user", content: "c" },
      { role: "user", content: "d" },
    ]);
    for (let i = 1; i < turns.length; i++) {
      assert.notEqual(turns[i].role, turns[i - 1].role);
    }
  });
});

describe("MockProvider", () => {
  const options = {
    system: "# Wren\nAn archivist.",
    messages: [{ role: "user" as const, content: "Are you still here?" }],
    model: "mock",
    temperature: 0.8,
    maxTokens: 600,
  };

  it("streams text and finishes with usage", async () => {
    const chunks = [];
    for await (const chunk of new MockProvider().stream(options)) chunks.push(chunk);

    const done = chunks.at(-1);
    assert.equal(done?.type, "done");
    assert.ok((done?.tokensOut ?? 0) > 0);
    assert.ok(chunks.filter((c) => c.type === "text").length > 1, "should emit multiple deltas");
  });

  it("is deterministic for the same conversation", async () => {
    const collect = async () => {
      let text = "";
      for await (const chunk of new MockProvider().stream(options)) {
        if (chunk.type === "text") text += chunk.text;
      }
      return text;
    };
    assert.equal(await collect(), await collect());
  });

  it("reflects the character name from the system prompt", async () => {
    let text = "";
    for await (const chunk of new MockProvider().stream({ ...options, maxTokens: 1200 })) {
      if (chunk.type === "text") text += chunk.text;
    }
    assert.match(text, /Wren/);
  });

  it("stops promptly when aborted", async () => {
    const controller = new AbortController();
    const chunks = [];
    for await (const chunk of new MockProvider().stream({ ...options, signal: controller.signal })) {
      chunks.push(chunk);
      controller.abort();
    }
    assert.equal(chunks.at(-1)?.finishReason, "aborted");
  });
});
