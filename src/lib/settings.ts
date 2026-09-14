/**
 * Viewer preferences. Pure module — no database, no server-only imports — so
 * normalisation can be unit tested and shared with client components.
 */

import { parseJson } from "./json";
import { DEFAULT_MODEL, RESPONSE_LENGTHS, type ResponseLength } from "./constants";

export interface UserSettings {
  model: string;
  temperature: number;
  responseLength: ResponseLength;
  /** Render *actions* in italics and strip stray markdown artefacts. */
  prettyRoleplay: boolean;
  /** Show mature-tagged characters in browse surfaces. */
  showMature: boolean;
  theme: "dark" | "light" | "system";
}

export const DEFAULT_SETTINGS: UserSettings = {
  model: DEFAULT_MODEL,
  temperature: 0.85,
  responseLength: "medium",
  prettyRoleplay: true,
  showMature: false,
  theme: "dark",
};

/**
 * Clamps stored settings back into valid ranges before they reach the model.
 * Rows can be stale (an old model id, a removed length preset) or hand-edited,
 * so every field is re-validated rather than trusted.
 */
export function normalizeSettings(raw: string | null | undefined): UserSettings {
  const parsed = parseJson<UserSettings>(raw, DEFAULT_SETTINGS);
  const temperature = Number(parsed.temperature);

  return {
    model: typeof parsed.model === "string" && parsed.model ? parsed.model : DEFAULT_SETTINGS.model,
    temperature: Number.isFinite(temperature)
      ? Math.min(1.5, Math.max(0, temperature))
      : DEFAULT_SETTINGS.temperature,
    responseLength: RESPONSE_LENGTHS.includes(parsed.responseLength)
      ? parsed.responseLength
      : DEFAULT_SETTINGS.responseLength,
    prettyRoleplay: Boolean(parsed.prettyRoleplay),
    showMature: Boolean(parsed.showMature),
    theme: ["dark", "light", "system"].includes(parsed.theme) ? parsed.theme : DEFAULT_SETTINGS.theme,
  };
}
