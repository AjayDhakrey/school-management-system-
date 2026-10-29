"use client";

import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Bus, Download, Pencil, Phone, Plus, Trash2, UserSquare2, Users2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useTransport,
  useTransportDrivers,
  useTransportAttendants,
  type ApiTransportDriver,
  type ApiTransportAttendant,
  type TransportPersonStatus,
} from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { PhoneInput } from "@/components/shared/PhoneInput";

const NONE = "__none__";
type Kind = "drivers" | "attendants";
type Person = ApiTransportDriver | ApiTransportAttendant;

/** "Expires 12 Mar 2027", flagged amber within 30 days and red once expired. */
function licenseState(expiry: string | null | undefined) {
  if (!expiry) return null;
  const when = new Date(`${expiry.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(when.getTime())) return null;
  const days = Math.ceil((when.getTime() - Date.now()) / 86_400_000);
  const date = when.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  if (days < 0) return { label: `Expired ${date}`, tone: "font-semibold text-destructive" };
  if (days <= 30)
    return { label: `Expires ${date} · ${days}d left`, tone: "font-semibold text-warning" };
  return { label: `Expires ${date}`, tone: "text-muted-foreground" };
}

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
              <Input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
              />
            </div>
            <div className="space-y-1">
              <Label>Phone</Label>
              <PhoneInput value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            {isDriver && (
              <>
                <div className="space-y-1">
                  <Label>License No.</Label>
                  <Input value={licenseNo} onChange={(e) => setLicenseNo(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>License Expiry</Label>
                  <Input
                    type="date"
                    value={licenseExpiry ?? ""}
                    onChange={(e) => setLicenseExpiry(e.target.value)}
                  />
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

  const people: Person[] = useMemo(
    () => (isDriver ? driversQuery.data : attendantsQuery.data) ?? [],
    [isDriver, driversQuery.data, attendantsQuery.data],
  );
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

  // Drivers typed straight onto a vehicle (its driver name/phone fields) before driver
  // profiles existed have no row here. Offer to turn them into profiles on that vehicle.
  const unprofiledDrivers = useMemo(() => {
    if (!isDriver || driversQuery.isLoading) return [];
    const profiledVehicles = new Set(people.map((p) => p.assigned_vehicle_id).filter(Boolean));
    const profiledNames = new Set(people.map((p) => p.name.trim().toLowerCase()));
    return (vehicles ?? []).filter(
      (v) =>
        v.driver?.trim() &&
        !profiledVehicles.has(v.id) &&
        !profiledNames.has(v.driver.trim().toLowerCase()),
    );
  }, [isDriver, driversQuery.isLoading, people, vehicles]);
  const [importing, setImporting] = useState(false);

  async function importFromVehicles() {
    setImporting(true);
    let added = 0;
    try {
      for (const v of unprofiledDrivers) {
        await api.post("/transport-drivers", {
          name: v.driver!.trim(),
          phone: v.driver_phone?.trim() || null,
          status: "Active",
          assignedVehicleId: v.id,
        });
        added++;
      }
      toast.success(`${added} driver${added === 1 ? "" : "s"} imported`);
    } catch (err) {
      toast.error(
        `${added ? `${added} imported, then: ` : ""}${err instanceof ApiError ? err.message : "Import failed"}`,
      );
    } finally {
      await invalidate();
      setImporting(false);
    }
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
      {unprofiledDrivers.length > 0 && (
        <div className="m-4 mb-0 flex flex-col gap-3 rounded-xl border border-info/25 bg-info-soft/50 p-3.5 sm:flex-row sm:items-center">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-info/15 text-info">
            <Download className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {unprofiledDrivers.length} driver{unprofiledDrivers.length === 1 ? " is" : "s are"}{" "}
              named on vehicles but {unprofiledDrivers.length === 1 ? "has" : "have"} no profile
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {unprofiledDrivers
                .map((v) => `${v.driver!.trim()} (${v.number ?? "vehicle"})`)
                .join(", ")}
              . Import them to manage licenses, status and assignments here.
            </p>
          </div>
          <Button
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={() => void importFromVehicles()}
            disabled={importing}
          >
            <Download className="h-4 w-4" />
            {importing ? "Importing…" : "Import from vehicles"}
          </Button>
        </div>
      )}
      {isLoading ? (
        <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>
      ) : people.length === 0 ? (
        <EmptyState
          title={`No ${isDriver ? "drivers" : "attendants"} yet`}
          description={`${isDriver ? "Drivers" : "Attendants"} you add will appear here.`}
          icon={isDriver ? UserSquare2 : Users2}
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 pl-5">#</TableHead>
                <TableHead>{isDriver ? "Driver" : "Attendant"}</TableHead>
                <TableHead>Phone</TableHead>
                {isDriver && <TableHead>License</TableHead>}
                <TableHead>Vehicle</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-5 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.map((p, index) => {
                const driver = isDriver ? (p as ApiTransportDriver) : null;
                const expiry = licenseState(driver?.license_expiry);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="pl-5 text-xs text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-[160px] items-center gap-2.5">
                        <Initials name={p.name} tone="gold" />
                        <span className="truncate text-sm font-semibold">{p.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {p.phone ? (
                        <a href={`tel:${p.phone}`} className="hover:text-primary hover:underline">
                          {p.phone}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    {isDriver && (
                      <TableCell className="whitespace-nowrap">
                        <p className="text-sm">{driver?.license_no ?? "—"}</p>
                        {expiry && <p className={cn("text-[11px]", expiry.tone)}>{expiry.label}</p>}
                      </TableCell>
                    )}
                    <TableCell className="whitespace-nowrap">
                      {p.assigned_vehicle_id ? (
                        <span className="inline-flex items-center gap-1.5 text-sm">
                          <Bus className="h-3.5 w-3.5 text-primary" />
                          {vehiclesById.get(p.assigned_vehicle_id) ?? "Assigned"}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={p.status} />
                    </TableCell>
                    <TableCell className="pr-5">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5"
                          onClick={() => setEditTarget(p)}
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Button>
                        {p.phone && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 p-0"
                            asChild
                            aria-label={`Call ${p.name}`}
                          >
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
                          aria-label={`Remove ${p.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
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
              Remove {deleteTarget?.name ?? "this person"}? Their vehicle assignment will be
              cleared.
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
