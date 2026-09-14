import { requireViewer } from "@/lib/auth";
import { json, route } from "@/lib/api";
import { planSchema } from "@/lib/validation";
import { planInfo } from "@/lib/constants";
import { grantPlanCredits } from "@/lib/credits";

export const runtime = "nodejs";

/**
 * Plan switching.
 *
 * There is no payment processor wired up — this is the seam a real billing
 * integration (Stripe checkout + webhook) would plug into. It grants the
 * tier's credits immediately so the quota system is fully exercisable.
 */
export const POST = route(async (request: Request) => {
  const viewer = await requireViewer();
  const { plan } = planSchema.parse(await request.json());
  const info = planInfo(plan);

  await grantPlanCredits(viewer.id, plan, info.credits);

  return json({ ok: true, plan: info });
});
