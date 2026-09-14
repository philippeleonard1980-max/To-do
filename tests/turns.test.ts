import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { labelGroupTurns, pickSpeaker, trendingScore, windowTurns } from "../src/lib/turns";

const cast = [
  { id: "a", name: "Wren" },
  { id: "b", name: "Sol" },
  { id: "c", name: "Oriel" },
];

describe("pickSpeaker", () => {
  it("honours an explicit request", () => {
    assert.equal(pickSpeaker(cast, "", null, "c").id, "c");
  });

  it("ignores a request for someone not in the room", () => {
    assert.equal(pickSpeaker(cast, "", null, "zzz").id, "a");
  });

  it("picks whoever the user addressed by name", () => {
    assert.equal(pickSpeaker(cast, "Sol, what do you think?", null).id, "b");
  });

  it("matches names case-insensitively", () => {
    assert.equal(pickSpeaker(cast, "hey oriel", null).id, "c");
  });

  it("does not hand the turn straight back to the last speaker", () => {
    // "Wren" is named, but Wren just spoke, so someone else should answer.
    assert.notEqual(pickSpeaker(cast, "Wren is right", "a").id, "a");
  });

  it("round-robins when nobody is addressed", () => {
    assert.equal(pickSpeaker(cast, "go on", "a").id, "b");
    assert.equal(pickSpeaker(cast, "go on", "b").id, "c");
    assert.equal(pickSpeaker(cast, "go on", "c").id, "a", "wraps around");
  });

  it("falls back to the first character with no history", () => {
    assert.equal(pickSpeaker(cast, "", null).id, "a");
  });
});

describe("windowTurns", () => {
  const messages = [
    { role: "system" as const, content: "ignored" },
    { role: "user" as const, content: "hello" },
    { role: "assistant" as const, content: "  " },
    { role: "assistant" as const, content: "hi there" },
  ];

  it("drops system turns and blank content", () => {
    const turns = windowTurns(messages, "free");
    assert.deepEqual(turns, [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
    ]);
  });

  it("caps history at the plan's window", () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `turn ${i}`,
    }));
    assert.equal(windowTurns(many, "free").length, 30);
    assert.equal(windowTurns(many, "plus").length, 80);
    assert.ok(windowTurns(many, "pro").length > 80);
  });
});

describe("labelGroupTurns", () => {
  it("prefixes assistant turns with the speaking character", () => {
    const names = new Map([["a", "Wren"]]);
    const turns = labelGroupTurns(
      [
        { role: "user", content: "who's there?" },
        { role: "assistant", content: "*a page turns*", characterId: "a" },
      ],
      names,
      "free",
    );
    assert.deepEqual(turns, [
      { role: "user", content: "who's there?" },
      { role: "assistant", content: "Wren: *a page turns*" },
    ]);
  });

  it("leaves unknown speakers unlabelled rather than guessing", () => {
    const turns = labelGroupTurns(
      [{ role: "assistant", content: "hm", characterId: "gone" }],
      new Map(),
      "free",
    );
    assert.equal(turns[0].content, "hm");
  });
});

describe("trendingScore", () => {
  const now = Date.parse("2026-01-10T00:00:00Z");
  const hoursAgo = (h: number) => new Date(now - h * 3_600_000);

  it("ranks a fresh, active character above an old, popular one", () => {
    const fresh = trendingScore({ chatCount: 20, likeCount: 5, createdAt: hoursAgo(3) }, now);
    const stale = trendingScore({ chatCount: 900, likeCount: 400, createdAt: hoursAgo(24 * 400) }, now);
    assert.ok(fresh > stale);
  });

  it("weights likes more heavily than chats", () => {
    const liked = trendingScore({ chatCount: 0, likeCount: 10, createdAt: hoursAgo(10) }, now);
    const chatted = trendingScore({ chatCount: 10, likeCount: 0, createdAt: hoursAgo(10) }, now);
    assert.ok(liked > chatted);
  });

  it("decays monotonically with age at equal popularity", () => {
    const newer = trendingScore({ chatCount: 10, likeCount: 10, createdAt: hoursAgo(5) }, now);
    const older = trendingScore({ chatCount: 10, likeCount: 10, createdAt: hoursAgo(500) }, now);
    assert.ok(newer > older);
  });
});
