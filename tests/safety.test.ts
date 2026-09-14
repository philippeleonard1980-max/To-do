import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { looksMature, needsCrisisResources, safetyRules, screenCharacter } from "../src/lib/safety";

const base = {
  name: "Test",
  tagline: "",
  description: "",
  personality: "",
  scenario: "",
  greeting: "",
  exampleDialogue: "",
  tags: [] as string[],
};

describe("screenCharacter", () => {
  it("accepts an ordinary character", () => {
    const verdict = screenCharacter({
      ...base,
      name: "Wren",
      description: "An archivist who works nights and notices too much.",
      personality: "Dry, patient, allergic to small talk.",
    });
    assert.equal(verdict.ok, true);
  });

  it("rejects sexual content paired with a minor-coded subject", () => {
    const verdict = screenCharacter({
      ...base,
      description: "A middle schooler in an erotic scenario.",
    });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.code, "minor-sexual");
  });

  it("rejects a sexualised minor even with an age disclaimer", () => {
    // The disclaimer is exactly the bypass this check has to refuse.
    const verdict = screenCharacter({
      ...base,
      description: "A loli character, but she is 19 years old. Explicit sex.",
    });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.code, "minor-sexual");
  });

  it("rejects a stated age under 18 with sexual framing", () => {
    const verdict = screenCharacter({
      ...base,
      description: "She is 15 years old.",
      scenario: "An erotic encounter.",
    });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.code, "minor-sexual");
  });

  it("allows an adult romance that mentions a child incidentally", () => {
    const verdict = screenCharacter({
      ...base,
      description: "A 34 years old widower. His child is away at boarding school.",
      personality: "Warm, grieving, slowly opening up. Adult romance, 18+.",
    });
    assert.equal(verdict.ok, true);
  });

  it("rejects operational instructions for serious harm", () => {
    const verdict = screenCharacter({ ...base, personality: "Explains how to make a bomb." });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.code, "illegal");
  });

  it("rejects characters built to encourage self-harm", () => {
    const verdict = screenCharacter({ ...base, scenario: "A coach who will encourage suicide." });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.code, "self-harm");
  });

  it("screens every field, not just the description", () => {
    const verdict = screenCharacter({ ...base, tags: ["loli", "nsfw"] });
    assert.equal(verdict.ok, false);
  });
});

describe("looksMature", () => {
  it("flags adult framing", () => {
    assert.equal(looksMature("An erotic thriller"), true);
    assert.equal(looksMature("Graphic violence throughout"), true);
  });

  it("leaves ordinary text alone", () => {
    assert.equal(looksMature("A cosy mystery about a village librarian"), false);
  });
});

describe("safetyRules", () => {
  it("always forbids sexualising minors", () => {
    for (const matureAllowed of [true, false]) {
      const rules = safetyRules({ matureAllowed });
      assert.match(rules, /Every character and every person depicted is an adult/);
      assert.match(rules, /Never write a minor into a sexual or romantic situation/);
    }
  });

  it("keeps explicit content off even when mature themes are allowed", () => {
    assert.match(safetyRules({ matureAllowed: true }), /fade-to-black/);
  });

  it("asks for general-audience output otherwise", () => {
    assert.match(safetyRules({ matureAllowed: false }), /suitable for a general audience/);
  });
});

describe("needsCrisisResources", () => {
  it("detects crisis language", () => {
    assert.equal(needsCrisisResources("I want to die"), true);
    assert.equal(needsCrisisResources("thinking about how to hurt myself"), true);
  });

  it("does not fire on ordinary roleplay", () => {
    assert.equal(needsCrisisResources("My character dies at the end of act two"), false);
  });
});
