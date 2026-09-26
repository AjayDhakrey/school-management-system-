"use client";

import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Bus, Pencil, Phone, Plus, Trash2, UserSquare2, Users2 } from "lucide-react";
import { PageHeader, EmptyState, Initials } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useTransport,
  useTransportDrivers,
  useTransportAttendants,
  type ApiTransportDriver,
  type ApiTransportAttendant,
  type TransportPersonStatus,
} from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";

const NONE = "__none__";
type Kind = "drivers" | "attendants";
type Person = ApiTransportDriver | ApiTransportAttendant;

function PersonDialog({
  kind,
  person,
  vehicles,
  open,
  onOpenChange,
  onDone,
}: {
  kind: Kind;
  person?: Person | null;
  vehicles: { id: string; number: string | null }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const isEdit = !!person;
  const isDriver = kind === "drivers";
  const [name, setName] = useState(person?.name ?? "");
  const [phone, setPhone] = useState(person?.phone ?? "");
  const [licenseNo, setLicenseNo] = useState(
    isDriver ? ((person as ApiTransportDriver | undefined)?.license_no ?? "") : "",
  );
  const [licenseExpiry, setLicenseExpiry] = useState(
    isDriver ? ((person as ApiTransportDriver | undefined)?.license_expiry ?? "") : "",
  );
  const [idProofNo, setIdProofNo] = useState(person?.id_proof_no ?? "");
  const [address, setAddress] = useState(person?.address ?? "");
  const [status, setStatus] = useState<TransportPersonStatus>(person?.status ?? "Active");
  const [vehicleId, setVehicleId] = useState(person?.assigned_vehicle_id ?? NONE);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        phone: phone.trim() || null,
        idProofNo: idProofNo.trim() || null,
        address: address.trim() || null,
        status,
        assignedVehicleId: vehicleId === NONE ? null : vehicleId,
      };
      if (isDriver) {
        payload["licenseNo"] = licenseNo.trim() || null;
        payload["licenseExpiry"] = licenseExpiry || null;
      }
      const path = isEdit ? `/transport-${kind}/${person.id}` : `/transport-${kind}`;
      if (isEdit) await api.patch(path, payload);
      else await api.post(path, payload);
      toast.success(isEdit ? "Details updated" : `${isDriver ? "Driver" : "Attendant"} added`);
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit" : "Add"} {isDriver ? "Driver" : "Attendant"}
          </DialogTitle>
          <DialogDescription>
            {isDriver
              ? "Profile, license and vehicle assignment for this driver."
              : "Profile and vehicle assignment for this attendant."}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
            </div>
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 (555) ..." />
            </div>
            {isDriver && (
              <>
                <div className="space-y-1">
                  <Label>License No.</Label>
                  <Input value={licenseNo} onChange={(e) => setLicenseNo(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>License Expiry</Label>
                  <Input type="date" value={licenseExpiry ?? ""} onChange={(e) => setLicenseExpiry(e.target.value)} />
                </div>
              </>
            )}
            <div className="space-y-1">
              <Label>ID Proof No.</Label>
              <Input value={idProofNo} onChange={(e) => setIdProofNo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as TransportPersonStatus)}>
                <SelectTrigger className="h-9 bg-surface text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                  <SelectItem value="On Leave">On Leave</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Address</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Assigned Vehicle</Label>
              <Select value={vehicleId ?? NONE} onValueChange={setVehicleId}>
                <SelectTrigger className="h-9 bg-surface text-sm">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Unassigned</SelectItem>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.number ?? v.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PersonList({ kind }: { kind: Kind }) {
  const isDriver = kind === "drivers";
  const driversQuery = useTransportDrivers(isDriver);
  const attendantsQuery = useTransportAttendants(!isDriver);
  const { data: vehicles } = useTransport();
  const queryClient = useQueryClient();

  const people: Person[] = (isDriver ? driversQuery.data : attendantsQuery.data) ?? [];
  const isLoading = isDriver ? driversQuery.isLoading : attendantsQuery.isLoading;

  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Person | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Person | null>(null);

  const vehiclesById = useMemo(
    () => new Map((vehicles ?? []).map((v) => [v.id, v.number])),
    [vehicles],
  );

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: [`transport-${kind}`] });
    await queryClient.invalidateQueries({ queryKey: ["transport"] });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await api.delete(`/transport-${kind}/${deleteTarget.id}`);
      toast.success(`${isDriver ? "Driver" : "Attendant"} removed`);
      await invalidate();
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to remove");
    }
  }

  return (
    <SectionCard
      bodyClassName="p-0"
      action={
        <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> Add {isDriver ? "Driver" : "Attendant"}
        </Button>
      }
    >
      {isLoading ? (
        <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>
      ) : people.length === 0 ? (
        <EmptyState
          title={`No ${isDriver ? "drivers" : "attendants"} yet`}
          description={`${isDriver ? "Drivers" : "Attendants"} you add will appear here.`}
          icon={isDriver ? UserSquare2 : Users2}
        />
      ) : (
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((p) => (
            <div key={p.id} className="panel flex flex-col gap-2.5 p-3.5">
              <div className="flex items-center gap-2.5">
                <Initials name={p.name} tone="gold" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{p.phone ?? "—"}</p>
                </div>
                <StatusBadge status={p.status} />
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Bus className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {p.assigned_vehicle_id ? (vehiclesById.get(p.assigned_vehicle_id) ?? "Assigned") : "Unassigned"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 gap-1.5"
                  onClick={() => setEditTarget(p)}
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                {p.phone && (
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0" asChild>
                    <a href={`tel:${p.phone}`}>
                      <Phone className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(p)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <PersonDialog
        key={addOpen ? "add-open" : "add-closed"}
        kind={kind}
        vehicles={vehicles ?? []}
        open={addOpen}
        onOpenChange={setAddOpen}
        onDone={async () => {
          await invalidate();
          setAddOpen(false);
        }}
      />
      <PersonDialog
        key={editTarget?.id ?? "edit-empty"}
        kind={kind}
        person={editTarget}
        vehicles={vehicles ?? []}
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        onDone={async () => {
          await invalidate();
          setEditTarget(null);
        }}
      />

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove {isDriver ? "Driver" : "Attendant"}</DialogTitle>
            <DialogDescription>
              Remove {deleteTarget?.name ?? "this person"}? Their vehicle assignment will be cleared.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

export default function TransportDriversPage({ tab = "drivers" }: { tab?: Kind }) {
  return (
    <div>
      <PageHeader
        title="Drivers & Attendants"
        description="Manage transport staff profiles, licenses and vehicle assignments."
        breadcrumb={["Dashboard", "Transport", "Drivers & Attendants"]}
      />
      <Tabs defaultValue={tab} className="w-full">
        <div className="scrollbar-slim mb-4 overflow-x-auto">
          <TabsList className="w-max flex-nowrap justify-start gap-1">
            <TabsTrigger value="drivers" className="gap-1.5">
              <UserSquare2 className="h-3.5 w-3.5" /> Drivers
            </TabsTrigger>
            <TabsTrigger value="attendants" className="gap-1.5">
              <Users2 className="h-3.5 w-3.5" /> Attendants
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="drivers">
          <PersonList kind="drivers" />
        </TabsContent>
        <TabsContent value="attendants">
          <PersonList kind="attendants" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
