import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { InsufficientCreditsError } from "./credits";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (message: string) => new HttpError(400, message);
export const unauthorized = (message = "Sign in to continue.") => new HttpError(401, message);
export const forbidden = (message = "You don't have access to that.") => new HttpError(403, message);
export const notFound = (message = "Not found.") => new HttpError(404, message);

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

/**
 * Single place route handlers convert thrown errors into responses, so no
 * handler has to hand-roll try/catch shapes and nothing leaks a stack trace.
 */
export function errorResponse(error: unknown) {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof InsufficientCreditsError) {
    return NextResponse.json({ error: error.message, code: "insufficient-credits" }, { status: 402 });
  }
  if (error instanceof ZodError) {
    const first = error.issues[0];
    const path = first?.path.join(".");
    return NextResponse.json(
      { error: path ? `${path}: ${first.message}` : (first?.message ?? "Invalid input."), issues: error.issues },
      { status: 422 },
    );
  }
  // A malformed request body is the client's error, not ours.
  if (error instanceof SyntaxError && /JSON/i.test(error.message)) {
    return NextResponse.json({ error: "Request body is not valid JSON." }, { status: 400 });
  }

  const status = (error as { status?: number })?.status;
  if (typeof status === "number" && status >= 400 && status < 600) {
    return NextResponse.json({ error: (error as Error).message }, { status });
  }

  console.error("Unhandled API error:", error);
  return NextResponse.json({ error: "Something went wrong on our end." }, { status: 500 });
}

/** Wraps a route handler with the shared error funnel. */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      return errorResponse(error);
    }
  };
}
