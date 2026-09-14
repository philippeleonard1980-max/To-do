import { prisma } from "@/lib/db";
import { requireViewer } from "@/lib/auth";
import { badRequest, forbidden, json, notFound, route } from "@/lib/api";
import { selectVariantSchema } from "@/lib/validation";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Switches which regenerated variant ("swipe") is shown for a message. */
export const POST = route(async (request: Request, { params }: Params) => {
  const { id } = await params;
  const viewer = await requireViewer();
  const body = selectVariantSchema.parse(await request.json());

  const message = await prisma.message.findUnique({
    where: { id },
    include: { chat: { select: { userId: true } }, variants: { orderBy: { index: "asc" } } },
  });
  if (!message) throw notFound("That message doesn't exist.");
  if (message.chat.userId !== viewer.id) throw forbidden("That message belongs to someone else's chat.");

  const variant = message.variants.find((v) => v.index === body.index);
  if (!variant) throw badRequest("That version doesn't exist.");

  await prisma.message.update({ where: { id }, data: { activeVariant: body.index } });

  return json({
    ok: true,
    content: variant.content,
    activeVariant: body.index,
    variantCount: message.variants.length,
  });
});
