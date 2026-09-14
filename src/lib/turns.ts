/**
 * Pure conversation helpers — no database, no server-only imports, so they can
 * be unit tested and reused on either side of the wire.
 */

import { PLAN_LIMITS, type Plan } from "./constants";

export interface TurnLike {
  role: "user" | "assistant" | "system";
  content: string;
  characterId?: string | null;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Selects the turns that fit the live context window. Older turns are covered
 * by the rolling memory summary instead of being resent every request.
 */
export function windowTurns(messages: TurnLike[], plan: Plan): ChatTurn[] {
  return messages
    .slice(-PLAN_LIMITS[plan].memoryTurns)
    .filter((m) => m.role !== "system" && m.content.trim().length > 0)
    .map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    }));
}

/** Group chats prefix each assistant turn so the model can track speakers. */
export function labelGroupTurns(
  messages: TurnLike[],
  characterNames: Map<string, string>,
  plan: Plan,
): ChatTurn[] {
  return messages
    .slice(-PLAN_LIMITS[plan].memoryTurns)
    .filter((m) => m.role !== "system" && m.content.trim().length > 0)
    .map((m) => {
      if (m.role === "user") return { role: "user" as const, content: m.content };
      const name = m.characterId ? characterNames.get(m.characterId) : null;
      return { role: "assistant" as const, content: name ? `${name}: ${m.content}` : m.content };
    });
}

/**
 * Chooses which character answers next in a group chat.
 *
 * Priority: an explicit request from the client, then a character the user
 * named in their last line, then round-robin so nobody is left out.
 */
export function pickSpeaker<T extends { id: string; name: string }>(
  participants: T[],
  lastUserText: string,
  lastSpeakerId: string | null,
  requestedId?: string,
): T {
  if (requestedId) {
    const requested = participants.find((p) => p.id === requestedId);
    if (requested) return requested;
  }

  const lowered = lastUserText.toLowerCase();
  const addressed = participants.filter(
    (p) => p.id !== lastSpeakerId && lowered.includes(p.name.toLowerCase()),
  );
  if (addressed.length > 0) return addressed[0];

  if (lastSpeakerId) {
    const index = participants.findIndex((p) => p.id === lastSpeakerId);
    if (index >= 0) return participants[(index + 1) % participants.length];
  }
  return participants[0];
}

/**
 * Trending score, Reddit-style: engagement on a log scale minus a linear time
 * penalty, where one week of age costs one order of magnitude of engagement.
 *
 * A purely multiplicative decay was tried first and made "trending" collapse
 * into "most chatted" — a year-old character with 60x the engagement still won.
 * Log-scaling the weight is what stops raw volume from dominating recency.
 */
export function trendingScore(
  c: { chatCount: number; likeCount: number; createdAt: Date },
  now = Date.now(),
): number {
  const ageHours = Math.max(0, (now - c.createdAt.getTime()) / 3_600_000);
  const weight = c.chatCount + c.likeCount * 3;
  return Math.log10(weight + 1) - ageHours / 168;
}
