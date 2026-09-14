"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, PartyPopper, Sparkles, Users2, Plus, MapPin, Clock3 } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { InfoCard } from "@/components/shared/InfoCard";
import { SchoolCalendar } from "@/components/shared/SchoolCalendar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useEvents, type ApiSchoolEvent } from "@/hooks/useApi";
import { api } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

const CATEGORIES = ["All", "Sports", "Academic", "Meeting", "Holiday", "Cultural"] as const;

const CATEGORY_TONE: Record<
  string,
  "success" | "info" | "warning" | "gold" | "danger" | "neutral"
> = {
  Sports: "success",
  Academic: "info",
  Meeting: "warning",
  Holiday: "gold",
  Cultural: "danger",
};

export default function Page() {
  const { user } = useAuth();
  const isStudent = user?.role === "STUDENT";
  const { data: events = [] } = useEvents();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("All");
  const [detail, setDetail] = useState<ApiSchoolEvent | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(
    () => (category === "All" ? events : events.filter((e) => e.category === category)),
    [events, category],
  );

  const dateEvents = useMemo(
    () => (selectedDate ? events.filter((e) => e.date === selectedDate) : []),
    [events, selectedDate],
  );

  const totalEvents = events.length;
  const thisMonth = events.filter((e) =>
    e.date.startsWith(new Date().toISOString().slice(0, 7)),
  ).length;
  const holidays = events.filter((e) => e.category === "Holiday").length;
  const meetings = events.filter((e) => e.category === "Meeting").length;

  return (
    <div>
      <PageHeader
        title="Events & School Calendar"
        description="Plan, track and browse upcoming school events."
        breadcrumb={["Dashboard", "Events"]}
        actions={
          isStudent ? undefined : (
            <Button size="sm" className="h-9" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Create Event
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard label="Total Events" value={totalEvents} icon={CalendarDays} tone="navy" />
        <InfoCard label="This Month" value={thisMonth} icon={Sparkles} tone="gold" />
        <InfoCard label="Holidays" value={holidays} icon={PartyPopper} tone="info" />
        <InfoCard label="Meetings" value={meetings} icon={Users2} tone="warning" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <SectionCard title="Calendar" subtitle="Select a date to view events">
          <SchoolCalendar onSelect={setSelectedDate} events={events} />
        </SectionCard>

        <div className="space-y-4">
          {selectedDate && (
            <SectionCard
              title={`Events on ${selectedDate}`}
              subtitle="Scheduled for the selected day"
            >
              {dateEvents.length === 0 ? (
                <EmptyState title="No events on this date" icon={CalendarDays} />
              ) : (
                <div className="space-y-2">
                  {dateEvents.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center justify-between rounded-xl border border-border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{e.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {e.time} · {e.location}
                        </p>
                      </div>
                      <StatusBadge
                        status={e.category}
                        tone={CATEGORY_TONE[e.category] ?? "neutral"}
                      />
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          )}

          <SectionCard title="Upcoming Events" subtitle="Filter events by category">
            <div className="mb-4 flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    category === c
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:bg-accent",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>

            {filtered.length === 0 ? (
              <EmptyState title="No events in this category" icon={CalendarDays} />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {filtered.map((e) => (
                  <div key={e.id} className="panel flex flex-col gap-2 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-semibold">{e.title}</p>
                      <StatusBadge
                        status={e.category}
                        tone={CATEGORY_TONE[e.category] ?? "neutral"}
                      />
                    </div>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5 shrink-0" /> {e.date}
                    </p>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock3 className="h-3.5 w-3.5 shrink-0" /> {e.time}
                    </p>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 shrink-0" /> {e.location}
                    </p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{e.description}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-1 h-8"
                      onClick={() => setDetail(e)}
                    >
                      View details
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.title}</DialogTitle>
                <DialogDescription>
                  {detail.date} · {detail.time}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <StatusBadge
                  status={detail.category}
                  tone={CATEGORY_TONE[detail.category] ?? "neutral"}
                />
                <p className="flex items-center gap-1.5 text-muted-foreground">
                  <MapPin className="h-4 w-4" /> {detail.location}
                </p>
                <p>{detail.description}</p>
              </div>
              <DialogFooter>
                <Button asChild>
                  <a
                    href={`data:text/calendar;charset=utf-8,${encodeURIComponent(`BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nDTSTART:${detail.date.replaceAll("-", "")}\nSUMMARY:${detail.title}\nLOCATION:${detail.location}\nEND:VEVENT\nEND:VCALENDAR`)}`}
                    download={`${detail.title}.ics`}
                  >
                    Add to calendar
                  </a>
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Event</DialogTitle>
            <DialogDescription>Add a new event to the school calendar.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const inputs = form.querySelectorAll("input");
              const data = {
                ...Object.fromEntries(new FormData(form)),
                time: inputs[2]?.value,
                category: inputs[4]?.value,
              };
              try {
                await api.post("/events", data);
                await queryClient.invalidateQueries({ queryKey: ["events"] });
                toast.success("Event created successfully");
                setCreateOpen(false);
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to create event");
              }
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label>Title</Label>
                <Input name="title" required placeholder="Event title" />
              </div>
              <div className="space-y-1">
                <Label>Date</Label>
                <Input
                  name="date"
                  required
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                />
              </div>
              <div className="space-y-1">
                <Label>Time</Label>
                <Input required placeholder="09:00 AM – 11:00 AM" />
              </div>
              <div className="space-y-1">
                <Label>Location</Label>
                <Input name="location" required placeholder="Main Ground" />
              </div>
              <div className="space-y-1">
                <Label>Category</Label>
                <Input required placeholder="Sports / Academic / Meeting…" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea name="description" required placeholder="Event description" />
            </div>
            <DialogFooter>
              <Button type="submit">Save Event</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
