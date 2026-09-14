/** Client-side reader for the server-sent event stream from /api/chats/[id]/messages. */

export interface StreamEvent {
  type: "user" | "start" | "delta" | "done" | "error" | "crisis";
  [key: string]: unknown;
}

/**
 * Reads an SSE body and yields parsed events.
 *
 * Handles chunk boundaries splitting mid-event, which a naive
 * `decode().split("\n\n")` per chunk gets wrong roughly whenever the reply is
 * long enough to matter.
 */
export async function* readEventStream(
  response: Response,
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  if (!response.body) throw new Error("The server returned no stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const raw = buffer.slice(0, boundary).trim();
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");

        if (!raw.startsWith("data:")) continue;
        const payload = raw.slice(5).trim();
        if (!payload) continue;

        try {
          yield JSON.parse(payload) as StreamEvent;
        } catch {
          // A truncated frame is not worth tearing the whole stream down for.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
