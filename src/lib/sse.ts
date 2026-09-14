/** Server-sent event helpers shared by the streaming endpoints. */

export interface SseEvent {
  type: string;
  [key: string]: unknown;
}

export function sseHeaders(): HeadersInit {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Tells nginx and friends not to buffer the stream into oblivion.
    "X-Accel-Buffering": "no",
  };
}

export function encodeEvent(event: SseEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

/** Builds a Response that streams events produced by `producer`. */
export function sseResponse(
  producer: (emit: (event: SseEvent) => void, signal: AbortSignal) => Promise<void>,
): Response {
  const controllerRef: { closed: boolean } = { closed: false };
  const abort = new AbortController();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: SseEvent) => {
        if (controllerRef.closed) return;
        try {
          controller.enqueue(encodeEvent(event));
        } catch {
          controllerRef.closed = true;
        }
      };

      try {
        await producer(emit, abort.signal);
      } catch (error) {
        emit({
          type: "error",
          error: error instanceof Error ? error.message : "Generation failed.",
        });
      } finally {
        if (!controllerRef.closed) {
          controllerRef.closed = true;
          try {
            controller.close();
          } catch {
            // Already closed by a client disconnect.
          }
        }
      }
    },
    cancel() {
      // The client navigated away or hit stop; let the producer unwind.
      controllerRef.closed = true;
      abort.abort();
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}
