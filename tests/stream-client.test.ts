import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readEventStream, type StreamEvent } from "../src/lib/stream-client";

/** Builds a Response whose body yields exactly the given byte chunks. */
function responseFrom(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream);
}

async function collect(chunks: string[]): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of readEventStream(responseFrom(chunks))) events.push(event);
  return events;
}

describe("readEventStream", () => {
  it("parses well-formed events", async () => {
    const events = await collect([
      'data: {"type":"start"}\n\n',
      'data: {"type":"delta","text":"hi"}\n\n',
      'data: {"type":"done"}\n\n',
    ]);
    assert.deepEqual(
      events.map((e) => e.type),
      ["start", "delta", "done"],
    );
  });

  it("reassembles an event split across chunk boundaries", async () => {
    // The case a naive per-chunk split gets wrong once replies get long.
    const events = await collect(['data: {"type":"del', 'ta","text":"hello"}\n', '\n']);
    assert.equal(events.length, 1);
    assert.equal(events[0].text, "hello");
  });

  it("handles several events arriving in one chunk", async () => {
    const events = await collect(['data: {"type":"delta","text":"a"}\n\ndata: {"type":"delta","text":"b"}\n\n']);
    assert.equal(events.length, 2);
    assert.deepEqual(events.map((e) => e.text), ["a", "b"]);
  });

  it("preserves multi-byte characters split mid-sequence", async () => {
    const encoder = new TextEncoder();
    const payload = encoder.encode('data: {"type":"delta","text":"né"}\n\n');
    // Cut inside the two-byte é so the decoder has to buffer across chunks.
    const cut = payload.length - 6;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(payload.slice(0, cut));
        controller.enqueue(payload.slice(cut));
        controller.close();
      },
    });

    const events: StreamEvent[] = [];
    for await (const event of readEventStream(new Response(stream))) events.push(event);
    assert.equal(events[0].text, "né");
  });

  it("skips malformed frames without dropping the rest", async () => {
    const events = await collect([
      "data: {not json}\n\n",
      'data: {"type":"done"}\n\n',
    ]);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "done");
  });

  it("ignores non-data lines such as comments and keep-alives", async () => {
    const events = await collect([": keep-alive\n\n", 'data: {"type":"done"}\n\n']);
    assert.equal(events.length, 1);
  });

  it("stops when the caller aborts", async () => {
    const controller = new AbortController();
    const events: StreamEvent[] = [];
    const response = responseFrom([
      'data: {"type":"delta","text":"a"}\n\n',
      'data: {"type":"delta","text":"b"}\n\n',
    ]);

    for await (const event of readEventStream(response, controller.signal)) {
      events.push(event);
      controller.abort();
    }
    assert.ok(events.length < 2);
  });

  it("throws a clear error when there is no body", async () => {
    await assert.rejects(
      async () => {
        for await (const _ of readEventStream(new Response(null))) {
          // Nothing to consume; the generator should throw first.
        }
      },
      /no stream/,
    );
  });
});
