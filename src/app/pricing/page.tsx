import { redirect } from "next/navigation";
import { Check } from "lucide-react";
import clsx from "clsx";

import { getViewer } from "@/lib/auth";
import { PLAN_INFO } from "@/lib/constants";
import { PlanPicker } from "@/components/PlanPicker";

export const metadata = { title: "Plans" };
export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <header className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Plans</h1>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-dim">
          Credits pay for replies — one per reply on the standard models, four on Opus 5. They
          refill on the first of your billing month.
        </p>
        <p className="mx-auto mt-3 max-w-lg rounded-lg border border-[var(--border)] px-3 py-2 text-xs text-faint">
          This instance has no payment processor connected. Switching plans grants the credits
          immediately so you can exercise the quota system.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {PLAN_INFO.map((plan) => {
          const current = viewer.plan === plan.id;
          return (
            <div
              key={plan.id}
              className={clsx(
                "flex flex-col rounded-2xl border p-6",
                current
                  ? "border-violet-500 bg-violet-500/5"
                  : "border-[var(--border)] bg-[var(--surface-raised)]",
              )}
            >
              <h2 className="text-lg font-semibold">{plan.label}</h2>
              <p className="mt-1 text-2xl font-bold tracking-tight">{plan.priceLabel}</p>
              <p className="mt-1 text-xs text-faint">
                {plan.credits.toLocaleString()} credits / month
              </p>

              <ul className="mt-5 flex-1 space-y-2.5">
                {plan.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-2 text-sm text-dim">
                    <Check size={15} className="mt-0.5 shrink-0 text-violet-400" />
                    {perk}
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                <PlanPicker plan={plan.id} current={current} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
