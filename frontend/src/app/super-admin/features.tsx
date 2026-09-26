"use client";

import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { usePlans, usePlanFeatures, type ApiPlan } from "@/hooks/useApi";
import { api } from "@/lib/api";

function PlanFeatureCard({ plan }: { plan: ApiPlan }) {
  const queryClient = useQueryClient();
  const { data: features, isLoading } = usePlanFeatures(plan.id);

  async function toggle(key: string, enabled: boolean) {
    try {
      await api.put(`/plans/${plan.id}/features`, { features: { [key]: enabled } });
      await queryClient.invalidateQueries({ queryKey: [`plan-features-${plan.id}`] });
      toast.success(`${key} ${enabled ? "enabled" : "disabled"} for ${plan.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update feature");
    }
  }

  return (
    <SectionCard title={plan.name} subtitle={`₹${plan.price.toLocaleString()}/${plan.billing_cycle === "YEARLY" ? "yr" : "mo"}`}>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {(features ?? []).map((f) => (
            <div key={f.feature_key} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
              <Label htmlFor={`${plan.id}-${f.feature_key}`} className="text-sm font-medium">
                {f.feature_key}
              </Label>
              <Switch
                id={`${plan.id}-${f.feature_key}`}
                checked={f.enabled}
                onCheckedChange={(checked) => toggle(f.feature_key, checked)}
              />
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

export default function FeatureControlPage() {
  const { data: plans, isLoading } = usePlans();

  return (
    <div>
      <PageHeader
        title="Feature Control"
        description="Toggle which modules are available on each subscription plan."
        breadcrumb={["Dashboard", "Feature Control"]}
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid gap-4">
          {(plans ?? []).map((p) => (
            <PlanFeatureCard key={p.id} plan={p} />
          ))}
        </div>
      )}
    </div>
  );
}
