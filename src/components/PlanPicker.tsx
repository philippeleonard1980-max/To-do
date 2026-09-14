"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "./ui";
import type { Plan } from "@/lib/constants";

export function PlanPicker({ plan, current }: { plan: Plan; current: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function choose() {
    setBusy(true);
    await fetch("/api/me/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <Button
      className="w-full"
      variant={current ? "outline" : "primary"}
      disabled={current}
      loading={busy}
      onClick={choose}
    >
      {current ? "Current plan" : "Switch to this plan"}
    </Button>
  );
}
