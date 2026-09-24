"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Settings } from "lucide-react";
import { PageHeader } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { Button } from "@/components/ui/button";
import { useFinancialSettings, type PaymentMethod } from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";

const ALL_METHODS: PaymentMethod[] = ["Cash", "UPI", "Card", "Bank Transfer", "Cheque", "Online"];

export default function FinancialSettingsPage() {
  const { data: settings, isLoading } = useFinancialSettings();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<PaymentMethod[]>(ALL_METHODS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) setSelected(settings.accepted_payment_methods);
  }, [settings]);

  function toggle(method: PaymentMethod) {
    setSelected((prev) =>
      prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method],
    );
  }

  async function handleSave() {
    if (selected.length === 0) {
      toast.error("At least one payment method must stay enabled");
      return;
    }
    setSaving(true);
    try {
      await api.patch("/financial-settings", { acceptedPaymentMethods: selected });
      await queryClient.invalidateQueries({ queryKey: ["financial-settings"] });
      toast.success("Financial settings saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Financial Settings"
        description="Configure which payment methods staff can record fee payments and expenses with."
        breadcrumb={["Dashboard", "Financial Settings"]}
      />

      <SectionCard title="Accepted Payment Methods" subtitle="Shown in the payment method picker across Fees and Expenses">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {ALL_METHODS.map((method) => {
                const active = selected.includes(method);
                return (
                  <button
                    key={method}
                    type="button"
                    onClick={() => toggle(method)}
                    className={`flex items-center justify-between rounded-xl border p-3 text-left text-sm font-medium transition-colors ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    {method}
                    <span
                      className={`grid h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors ${
                        active ? "justify-end bg-primary" : "justify-start bg-muted"
                      }`}
                    >
                      <span className="h-4 w-4 rounded-full bg-white shadow-sm" />
                    </span>
                  </button>
                );
              })}
            </div>
            <Button className="mt-4 gap-1.5" disabled={saving} onClick={handleSave}>
              <Settings className="h-4 w-4" /> {saving ? "Saving…" : "Save Settings"}
            </Button>
          </>
        )}
      </SectionCard>
    </div>
  );
}
