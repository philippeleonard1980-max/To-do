import { z } from "zod";

import { ACCENTS, CHAT_MODES, RESPONSE_LENGTHS, SORTS, VISIBILITIES, PLANS } from "./constants";

const trimmed = (max: number) => z.string().trim().max(max);

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .max(200, "That password is too long."),
  displayName: trimmed(40).min(2, "Pick a name with at least 2 characters."),
  username: trimmed(24)
    .min(3, "Usernames need at least 3 characters.")
    .regex(/^[a-zA-Z0-9_-]+$/, "Letters, numbers, hyphens and underscores only.")
    .optional(),
  birthdate: z.string().trim().optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export const characterSchema = z.object({
  name: trimmed(40).min(1, "Your character needs a name."),
  tagline: trimmed(120).default(""),
  description: trimmed(4000).default(""),
  personality: trimmed(4000).default(""),
  scenario: trimmed(4000).default(""),
  greeting: trimmed(4000).default(""),
  exampleDialogue: trimmed(6000).default(""),
  systemPromptOverride: trimmed(8000).optional().nullable(),
  avatarUrl: z.string().trim().max(2000).optional().nullable(),
  accent: z.enum(ACCENTS).default("violet"),
  visibility: z.enum(VISIBILITIES).default("public"),
  isMature: z.boolean().default(false),
  tags: z.array(trimmed(30).min(1)).max(10).default([]),
  /// Live-mode speech settings. Ranges match the Web Speech API's.
  voice: z
    .object({
      voiceName: trimmed(120).nullable().optional(),
      pitch: z.number().min(0.1).max(2).default(1.1),
      rate: z.number().min(0.1).max(2).default(1),
      volume: z.number().min(0).max(1).default(1),
      lang: trimmed(16).optional(),
    })
    .default({ pitch: 1.1, rate: 1, volume: 1 }),
});

export const personaSchema = z.object({
  name: trimmed(40).min(1, "Your persona needs a name."),
  description: trimmed(2000).default(""),
  avatarUrl: z.string().trim().max(2000).optional().nullable(),
  isDefault: z.boolean().default(false),
});

export const chatCreateSchema = z.object({
  characterIds: z.array(z.string().min(1)).min(1, "Pick at least one character.").max(6),
  personaId: z.string().min(1).optional().nullable(),
  mode: z.enum(CHAT_MODES).default("single"),
  title: trimmed(80).optional(),
});

export const chatUpdateSchema = z.object({
  title: trimmed(80).optional(),
  personaId: z.string().min(1).nullable().optional(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
  settings: z
    .object({
      model: z.string().min(1).optional(),
      temperature: z.number().min(0).max(1.5).optional(),
      responseLength: z.enum(RESPONSE_LENGTHS).optional(),
    })
    .optional(),
});

export const sendMessageSchema = z.object({
  content: z.string().trim().max(8000),
  /** Which character replies next in a group chat. */
  speakerId: z.string().min(1).optional(),
  /** Regenerate the last assistant turn instead of sending a new user turn. */
  regenerate: z.boolean().default(false),
});

export const editMessageSchema = z.object({
  content: z.string().trim().min(1, "Message can't be empty.").max(8000),
});

export const selectVariantSchema = z.object({
  index: z.number().int().min(0).max(50),
});

export const settingsSchema = z.object({
  displayName: trimmed(40).min(2).optional(),
  bio: trimmed(500).optional(),
  avatarUrl: z.string().trim().max(2000).nullable().optional(),
  allowMature: z.boolean().optional(),
  birthdate: z.string().trim().optional(),
  settings: z
    .object({
      model: z.string().min(1).optional(),
      temperature: z.number().min(0).max(1.5).optional(),
      responseLength: z.enum(RESPONSE_LENGTHS).optional(),
      prettyRoleplay: z.boolean().optional(),
      showMature: z.boolean().optional(),
      theme: z.enum(["dark", "light", "system"]).optional(),
    })
    .optional(),
});

export const browseSchema = z.object({
  q: z.string().trim().max(100).optional(),
  tag: z.string().trim().max(40).optional(),
  sort: z.enum(SORTS).default("trending"),
  creator: z.string().trim().max(40).optional(),
  cursor: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(48).default(24),
});

export const planSchema = z.object({ plan: z.enum(PLANS) });

export const reportSchema = z.object({
  characterId: z.string().min(1).optional(),
  reason: trimmed(60).min(1, "Tell us what's wrong."),
  detail: trimmed(2000).default(""),
});

// --- Admin -----------------------------------------------------------------
// Note these schemas are only ever parsed inside routes that have already
// passed `requireAdmin()`. They constrain what an admin may change; they are
// not, by themselves, an access control.

export const adminUserActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("suspend"), reason: trimmed(200).default("") }),
  z.object({ action: z.literal("unsuspend") }),
  z.object({ action: z.literal("setRole"), role: z.enum(["user", "admin"]) }),
  z.object({ action: z.literal("setPlan"), plan: z.enum(PLANS) }),
]);

export const adminCharacterActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("unpublish") }),
  z.object({ action: z.literal("delete") }),
]);

export const adminReportActionSchema = z.object({
  status: z.enum(["reviewed", "dismissed"]),
});
