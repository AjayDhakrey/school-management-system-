"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  DoorOpen,
  GraduationCap,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users2,
} from "lucide-react";
import { PageHeader, EmptyState, TableSkeleton } from "@/components/shared/ui-kit";
import { InfoCard } from "@/components/shared/InfoCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useClasses, useRooms, type ApiRoom } from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Add or edit one room. */
function RoomDialog({ room, onDone }: { room: ApiRoom | null; onDone: () => void }) {
  const [name, setName] = useState(room?.name ?? "");
  const [number, setNumber] = useState(room?.number ?? "");
  const [capacity, setCapacity] = useState(room?.capacity ? String(room.capacity) : "");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Enter a room name");
      return;
    }
    setBusy(true);
    const body = {
      name: name.trim(),
      number: number.trim() || null,
      capacity: capacity ? Number(capacity) : null,
    };
    try {
      if (room) await api.patch(`/rooms/${room.id}`, body);
      else await api.post("/rooms", body);
      toast.success(room ? "Room updated" : "Room added");
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save room");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>{room ? "Edit Room" : "Add Room"}</DialogTitle>
        <DialogDescription>
          Rooms can be assigned to classes and timetable periods.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={save} className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="room-name">Room name</Label>
          <Input
            id="room-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Room 202, Science Lab"
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="room-number">Room no.</Label>
            <Input
              id="room-number"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="202"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="room-capacity">Seats</Label>
            <Input
              id="room-capacity"
              type="number"
              min={1}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder="40"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : room ? "Save Changes" : "Add Room"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

export default function Page() {
  const { data: rooms, isLoading } = useRooms();
  const { data: classes } = useClasses();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "ACTIVE" | "INACTIVE">("all");
  const [editing, setEditing] = useState<ApiRoom | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<ApiRoom | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["rooms"] });

  // Which class sections sit in each room.
  const classesByRoom = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of classes ?? []) {
      if (!c.room_id || c.status === "ARCHIVED") continue;
      const base = c.section ? `${c.name}-${c.section}` : c.name;
      const label = /^class\b/i.test(base.trim()) ? base.trim() : `Class ${base.trim()}`;
      map.set(c.room_id, [...(map.get(c.room_id) ?? []), label]);
    }
    return map;
  }, [classes]);

  const all = rooms ?? [];
  const shown = all
    .filter((r) => {
      const q = search.trim().toLowerCase();
      if (status !== "all" && r.status !== status) return false;
      return (
        !q ||
        r.name.toLowerCase().includes(q) ||
        (r.number ?? "").toLowerCase().includes(q) ||
        (classesByRoom.get(r.id) ?? []).some((c) => c.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const activeCount = all.filter((r) => r.status === "ACTIVE").length;
  const seats = all.reduce((sum, r) => sum + (r.capacity ?? 0), 0);
  const inUse = all.filter((r) => classesByRoom.has(r.id)).length;

  async function toggle(room: ApiRoom) {
    setBusyId(room.id);
    try {
      await api.patch(`/rooms/${room.id}`, {
        status: room.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
      });
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update room");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(room: ApiRoom) {
    setBusyId(room.id);
    try {
      await api.delete(`/rooms/${room.id}`);
      await refresh();
      toast.success("Room deleted");
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? `${err.message}. If a class uses this room, deactivate it instead.`
          : "Failed to delete room",
      );
    } finally {
      setBusyId(null);
      setDeleting(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Classrooms"
        description="Rooms, labs and halls that classes and timetable periods are assigned to."
        breadcrumb={["Dashboard", "Classrooms"]}
        actions={
          <Button onClick={() => setAdding(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Add Room
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <InfoCard label="Total Rooms" value={all.length} icon={DoorOpen} tone="navy" />
        <InfoCard label="Active" value={activeCount} icon={CheckCircle2} tone="success" />
        <InfoCard label="In Use by Classes" value={inUse} icon={GraduationCap} tone="info" />
        <InfoCard label="Total Seats" value={seats.toLocaleString()} icon={Users2} tone="gold" />
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search room, number or class…"
            className="bg-card pl-9"
          />
        </div>
        <div className="inline-flex shrink-0 rounded-xl border border-border bg-card p-1 text-xs font-semibold">
          {(["all", "ACTIVE", "INACTIVE"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={cn(
                "flex-1 rounded-lg px-3 py-1.5 transition-colors",
                status === s ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {s === "all" ? "All" : s === "ACTIVE" ? "Active" : "Inactive"}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : shown.length === 0 ? (
        <EmptyState
          title={all.length ? "No rooms match" : "No rooms yet"}
          description={
            all.length ? "Try a different search or filter." : "Add your first classroom or lab."
          }
          icon={DoorOpen}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b-2 border-border bg-muted/40 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5">Room</th>
                  <th className="px-3 py-2.5">Room No.</th>
                  <th className="px-3 py-2.5">Used by</th>
                  <th className="px-3 py-2.5 text-right">Seats</th>
                  <th className="px-3 py-2.5 text-center">Active</th>
                  <th className="px-4 py-2.5 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((room) => {
                  const used = classesByRoom.get(room.id) ?? [];
                  const active = room.status === "ACTIVE";
                  const busy = busyId === room.id;
                  return (
                    <tr
                      key={room.id}
                      className={cn(
                        "border-b border-border/60 last:border-0 hover:bg-muted/30",
                        !active && "opacity-60",
                      )}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                            <DoorOpen className="h-4 w-4" />
                          </span>
                          <p className="truncate font-semibold">{room.name}</p>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground tabular-nums">
                        {room.number ?? <span className="text-muted-foreground/50">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {used.length ? (
                          <div className="flex flex-wrap gap-1">
                            {used.map((c) => (
                              <span
                                key={c}
                                className="inline-flex items-center gap-1 rounded-md bg-info-soft px-2 py-0.5 text-[11px] font-semibold text-info capitalize"
                              >
                                <GraduationCap className="h-3 w-3" />
                                {c}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/70">Free</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {room.capacity ?? <span className="text-muted-foreground/50">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => toggle(room)}
                          role="switch"
                          aria-checked={active}
                          title={active ? "Deactivate room" : "Activate room"}
                          className={cn(
                            "relative inline-block h-5 w-9 rounded-full align-middle transition-colors disabled:opacity-50",
                            active ? "bg-success" : "bg-muted-foreground/30",
                          )}
                        >
                          <span
                            className={cn(
                              "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
                              active ? "left-[18px]" : "left-0.5",
                            )}
                          />
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-primary hover:bg-primary/10 hover:text-primary"
                            title="Edit room"
                            aria-label={`Edit ${room.name}`}
                            onClick={() => setEditing(room)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            title="Delete room"
                            aria-label={`Delete ${room.name}`}
                            disabled={busy}
                            onClick={() => setDeleting(room)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog
        open={adding || !!editing}
        onOpenChange={(o) => {
          if (!o) {
            setAdding(false);
            setEditing(null);
          }
        }}
      >
        {(adding || editing) && (
          <RoomDialog
            key={editing?.id ?? "new"}
            room={editing}
            onDone={async () => {
              await refresh();
              setAdding(false);
              setEditing(null);
            }}
          />
        )}
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && classesByRoom.get(deleting.id)?.length
                ? `This room is assigned to Class ${classesByRoom.get(deleting.id)!.join(", ")}. Those classes will be left without a room.`
                : "This room will be removed permanently."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleting && remove(deleting)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
