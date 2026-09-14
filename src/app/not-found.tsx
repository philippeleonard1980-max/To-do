import Link from "next/link";

import { Button } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="text-5xl font-bold tracking-tight text-violet-500">404</p>
      <h1 className="mt-4 text-xl font-semibold">Nothing here</h1>
      <p className="mt-2 text-sm text-dim">
        This page, character, or conversation doesn&apos;t exist — or it&apos;s private.
      </p>
      <Link href="/" className="mt-6">
        <Button>Back to Discover</Button>
      </Link>
    </div>
  );
}
