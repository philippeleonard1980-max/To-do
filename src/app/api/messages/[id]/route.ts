import { prisma } from "@/lib/db";
import { requireViewer } from "@/lib/auth";
import { forbidden, json, notFound, route } from "@/lib/api";
import { editMessageSchema } from "@/lib/validation";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

async function ownedMessage(id: string, userId: string) {
  const message = await prisma.message.findUnique({
    where: { id },
    include: { chat: { select: { id: true, userId: true } } },
  });
  if (!message) throw notFound("That message doesn't exist.");
  if (message.chat.userId !== userId) throw forbidden("That message belongs to someone else's chat.");
  return message;
}

/** Edits the currently shown variant in place. */
export const PATCH = route(async (request: Request, { params }: Params) => {
  const { id } = await params;
  const viewer = await requireViewer();
  const message = await ownedMessage(id, viewer.id);
  const body = editMessageSchema.parse(await request.json());

  await prisma.messageVariant.updateMany({
    where: { messageId: id, index: message.activeVariant },
    data: { content: body.content },
  });

  return json({ ok: true, content: body.content });
});

/**
 * Deletes a message. `?after=true` also drops everything that followed it,
 * which is how you rewind a scene to an earlier beat.
 */
export const DELETE = route(async (request: Request, { params }: Params) => {
  const { id } = await params;
  const viewer = await requireViewer();
  const message = await ownedMessage(id, viewer.id);
  const alsoAfter = new URL(request.url).searchParams.get("after") === "true";

  if (alsoAfter) {
    await prisma.message.deleteMany({
      where: { chatId: message.chatId, position: { gte: message.position } },
    });
  } else {
    await prisma.message.delete({ where: { id } });
  }

  return json({ ok: true });
});
