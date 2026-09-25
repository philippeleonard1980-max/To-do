import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_VOICE, mouthShapeFor, pickVoice } from "../src/lib/speech";

/** Stand-in for the browser's SpeechSynthesisVoice. */
function voice(name: string, lang: string, localService = true) {
  return { name, lang, localService, default: false, voiceURI: name } as SpeechSynthesisVoice;
}

describe("mouthShapeFor", () => {
  it("opens wider for vowel-heavy words", () => {
    assert.ok(mouthShapeFor("aaa") > mouthShapeFor("hmm"));
    assert.ok(mouthShapeFor("open") > mouthShapeFor("strength"));
  });

  it("stays inside 0-1", () => {
    for (const word of ["", "a", "rhythms", "AEIOU", "!!!", "supercalifragilistic"]) {
      const value = mouthShapeFor(word);
      assert.ok(value >= 0 && value <= 1, `${word} -> ${value}`);
    }
  });

  it("never fully closes on a real word, so the mouth keeps moving", () => {
    assert.ok(mouthShapeFor("shh") >= 0.15);
  });

  it("ignores punctuation and case", () => {
    assert.equal(mouthShapeFor("Hello!"), mouthShapeFor("hello"));
  });
});

describe("pickVoice", () => {
  const voices = [
    voice("Daniel", "en-GB"),
    voice("Samantha", "en-US"),
    voice("Amélie", "fr-FR"),
    voice("Cloud Voice", "en-US", false),
  ];

  it("returns null when the device has no voices", () => {
    assert.equal(pickVoice([], DEFAULT_VOICE), null);
  });

  it("matches an exact requested name", () => {
    assert.equal(pickVoice(voices, { ...DEFAULT_VOICE, voiceName: "Samantha" })?.name, "Samantha");
  });

  it("falls back to a partial, case-insensitive match", () => {
    assert.equal(pickVoice(voices, { ...DEFAULT_VOICE, voiceName: "amé" })?.name, "Amélie");
  });

  it("prefers the requested language when no name is given", () => {
    const picked = pickVoice(voices, { ...DEFAULT_VOICE, voiceName: null, lang: "fr-FR" });
    assert.equal(picked?.lang, "fr-FR");
  });

  it("prefers a local voice over a network one", () => {
    // Network voices stall and break lip-sync timing.
    const picked = pickVoice(
      [voice("Cloud Voice", "en-US", false), voice("Samantha", "en-US", true)],
      { ...DEFAULT_VOICE, voiceName: null },
    );
    assert.equal(picked?.name, "Samantha");
  });

  it("still returns something when no language matches", () => {
    const picked = pickVoice([voice("Amélie", "fr-FR")], { ...DEFAULT_VOICE, lang: "ja-JP" });
    assert.ok(picked);
  });
});
