import { prisma } from "@/lib/db";
import { getViewer, normalizeSettings, requireViewer } from "@/lib/auth";
import { badRequest, json, route } from "@/lib/api";
import { settingsSchema } from "@/lib/validation";
import { stringifyJson } from "@/lib/json";
import { planAllowsModel, planInfo } from "@/lib/constants";
import { isMockProvider } from "@/lib/ai";
import { resolveUserKeys } from "@/lib/user-keys";

export const runtime = "nodejs";

export const GET = route(async () => {
  const viewer = await getViewer();
  if (!viewer) return json({ viewer: null, mockProvider: isMockProvider() });

  const userKeys = await resolveUserKeys(viewer.id);
  return json({
    viewer,
    plan: planInfo(viewer.plan),
    mockProvider: isMockProvider(userKeys),
  });
});

export const PATCH = route(async (request: Request) => {
  const viewer = await requireViewer();
  const body = settingsSchema.parse(await request.json());

  let birthdate: Date | undefined;
  if (body.birthdate !== undefined) {
    const parsed = new Date(body.birthdate);
    if (Number.isNaN(parsed.getTime())) throw badRequest("That birthdate isn't a valid date.");
    if (parsed.getTime() > Date.now()) throw badRequest("Birthdate can't be in the future.");
    birthdate = parsed;
  }

  const merged = normalizeSettings(
    stringifyJson({ ...viewer.settings, ...(body.settings ?? {}) }),
  );

  // Selecting a model the plan doesn't cover would fail later at generation
  // time, so reject it here where we can explain why.
  if (body.settings?.model && !planAllowsModel(viewer.plan, body.settings.model)) {
    throw badRequest("That model isn't included in your plan.");
  }

  const updated = await prisma.user.update({
    where: { id: viewer.id },
    data: {
      displayName: body.displayName,
      bio: body.bio,
      avatarUrl: body.avatarUrl,
      allowMature: body.allowMature,
      ...(birthdate ? { birthdate } : {}),
      settings: stringifyJson(merged),
    },
  });

  return json({
    ok: true,
    settings: merged,
    displayName: updated.displayName,
    // Mature content stays off unless the stored birthdate proves adulthood.
    allowMature: updated.allowMature,
  });
});
