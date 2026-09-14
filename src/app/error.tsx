"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-4 text-center">
      <h1 className="text-xl font-semibold">That didn&apos;t work</h1>
      <p className="mt-2 text-sm text-dim">
        Something broke while loading this page. Trying again usually clears it.
      </p>
      {error.digest && <p className="mt-2 text-xs text-faint">Reference: {error.digest}</p>}
      <div className="mt-6 flex gap-2">
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
