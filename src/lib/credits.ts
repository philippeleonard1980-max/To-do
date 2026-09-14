import "server-only";

import { prisma } from "./db";
import { getModel, type Plan } from "./constants";

export class InsufficientCreditsError extends Error {
  status = 402;
  constructor(public needed: number, public available: number) {
    super(
      `This reply costs ${needed} credit${needed === 1 ? "" : "s"} and you have ${available}. Credits refill monthly, or upgrade your plan for a higher ceiling.`,
    );
    this.name = "InsufficientCreditsError";
  }
}

/**
 * Reserves credits for a generation.
 *
 * Uses a conditional update so two concurrent generations can't both pass the
 * balance check — the second one's `credits: { gte: cost }` guard fails and
 * throws rather than letting the balance go negative.
 */
export async function spendCredits(
  userId: string,
  modelId: string,
  reason = "generation",
): Promise<number> {
  const cost = getModel(modelId).cost;

  const result = await prisma.user.updateMany({
    where: { id: userId, credits: { gte: cost } },
    data: { credits: { decrement: cost } },
  });

  if (result.count === 0) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { credits: true },
    });
    throw new InsufficientCreditsError(cost, user?.credits ?? 0);
  }

  await prisma.creditEntry.create({
    data: { userId, delta: -cost, reason, model: modelId },
  });

  return cost;
}

/** Returns credits after a failed generation so users aren't charged for errors. */
export async function refundCredits(userId: string, amount: number, reason = "refund"): Promise<void> {
  if (amount <= 0) return;
  await prisma.user.update({
    where: { id: userId },
    data: { credits: { increment: amount } },
  });
  await prisma.creditEntry.create({ data: { userId, delta: amount, reason } });
}

export async function grantPlanCredits(userId: string, plan: Plan, credits: number): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { plan, credits, creditsResetAt: new Date() },
  });
  await prisma.creditEntry.create({
    data: { userId, delta: credits, reason: `plan-change:${plan}` },
  });
}
