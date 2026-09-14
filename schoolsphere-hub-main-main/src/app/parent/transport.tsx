"use client";

import { Bus, MapPin, Phone, Clock3 } from "lucide-react";
import { PageHeader, EmptyState, CardSkeleton } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { useTransportFor } from "@/hooks/useApi";
import { useParentChild } from "@/lib/parent-child-context";

function Row({ icon: Icon, label, value }: { icon: typeof Bus; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium">{value || "—"}</p>
      </div>
    </div>
  );
}

export default function ParentTransportPage() {
  const { selectedChildId, isLoading: childrenLoading } = useParentChild();
  const { data: vehicle, isLoading } = useTransportFor(selectedChildId ?? undefined);

  return (
    <div>
      <PageHeader title="Transport" description="Assigned bus and route for this child." breadcrumb={["Dashboard", "Transport"]} />
      <ChildSwitcher />

      {childrenLoading || isLoading ? (
        <CardSkeleton count={2} />
      ) : !vehicle ? (
        <div className="panel">
          <EmptyState title="No transport assigned" description="This child isn't assigned to a school vehicle yet." icon={Bus} />
        </div>
      ) : (
        <SectionCard title={`Vehicle ${vehicle.number ?? ""}`} subtitle={vehicle.route ?? ""}>
          <Row icon={MapPin} label="Route" value={vehicle.route ?? "—"} />
          <Row icon={Bus} label="Driver" value={vehicle.driver ?? "—"} />
          <Row icon={Phone} label="Driver Phone" value={vehicle.driver_phone ?? "—"} />
          <Row icon={Clock3} label="Pickup" value={`${vehicle.pickup_point ?? "—"} · ${vehicle.pickup_time ?? "—"}`} />
          <Row icon={Clock3} label="Drop" value={`${vehicle.drop_point ?? "—"} · ${vehicle.drop_time ?? "—"}`} />
        </SectionCard>
      )}
    </div>
  );
}
