"use client";

import { useMemo } from "react";
import { PageHeader } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  useTransport,
  useTransportDrivers,
  useTransportAttendants,
  useStudents,
  useTransportAttendance,
  useTransportMaintenance,
  useFees,
  useTransportComplaints,
} from "@/hooks/useApi";

function Row({ label, value, tone }: { label: string; value: string; tone?: "success" | "warning" | "danger" }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          tone === "success"
            ? "font-semibold text-success"
            : tone === "warning"
              ? "font-semibold text-warning"
              : tone === "danger"
                ? "font-semibold text-destructive"
                : "font-semibold"
        }
      >
        {value}
      </span>
    </div>
  );
}

export default function TransportReportsPage() {
  const { data: vehicles } = useTransport();
  const { data: drivers } = useTransportDrivers();
  const { data: attendants } = useTransportAttendants();
  const { data: students } = useStudents();
  const today = new Date().toISOString().slice(0, 10);
  const { data: todayAttendance } = useTransportAttendance({ date: today });
  const { data: maintenance } = useTransportMaintenance();
  const { data: fees } = useFees();
  const { data: complaints } = useTransportComplaints();

  const vehicleRows = vehicles ?? [];
  const driverRows = drivers ?? [];
  const attendantRows = attendants ?? [];
  const studentRows = students ?? [];
  const maintenanceRows = maintenance ?? [];
  const complaintRows = complaints ?? [];

  const assignedStudents = studentRows.filter((s) => s.vehicle_id).length;
  const onRoute = vehicleRows.filter((v) => v.status === "On Route").length;
  const inMaintenance = vehicleRows.filter((v) => v.status === "Maintenance").length;

  const attendanceToday = todayAttendance ?? [];
  const boardedToday = attendanceToday.filter((a) => a.boarding_status === "Boarded").length;
  const absentToday = attendanceToday.filter((a) => a.boarding_status === "Absent").length;

  const totalMaintenanceCost = maintenanceRows.reduce((s, r) => s + r.cost, 0);
  const monthStr = today.slice(0, 7);
  const maintenanceThisMonth = maintenanceRows
    .filter((r) => r.service_date.slice(0, 7) === monthStr)
    .reduce((s, r) => s + r.cost, 0);
  const upcomingServices = maintenanceRows.filter(
    (r) => r.next_service_date && r.next_service_date >= today,
  ).length;

  const transportFees = useMemo(
    () => (fees ?? []).filter((f) => f.fee_type.toLowerCase().includes("transport")),
    [fees],
  );
  const feeBilled = transportFees.reduce((s, f) => s + Math.max(0, f.amount - f.discount + f.fine), 0);
  const feeCollected = transportFees.reduce((s, f) => s + f.paid_amount, 0);

  const openComplaints = complaintRows.filter((c) => c.status === "Open" || c.status === "In Progress").length;
  const resolvedComplaints = complaintRows.filter((c) => c.status === "Resolved" || c.status === "Closed").length;
  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of complaintRows) map.set(c.category, (map.get(c.category) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [complaintRows]);

  return (
    <div>
      <PageHeader
        title="Transport Reports"
        description="Vehicle, driver, route, student, attendance, maintenance, fee and complaint summaries."
        breadcrumb={["Dashboard", "Transport", "Reports"]}
      />

      <Tabs defaultValue="fleet" className="w-full">
        <div className="scrollbar-slim mb-4 overflow-x-auto">
          <TabsList className="w-max flex-nowrap justify-start gap-1">
            <TabsTrigger value="fleet">Fleet & Routes</TabsTrigger>
            <TabsTrigger value="staff">Drivers & Attendants</TabsTrigger>
            <TabsTrigger value="students">Students</TabsTrigger>
            <TabsTrigger value="attendance">Attendance</TabsTrigger>
            <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
            <TabsTrigger value="fees">Fees</TabsTrigger>
            <TabsTrigger value="complaints">Complaints</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="fleet">
          <SectionCard title="Fleet & Route Report" subtitle="Vehicle status across the fleet">
            <Row label="Total Vehicles" value={String(vehicleRows.length)} />
            <Row label="On Route" value={String(onRoute)} tone="success" />
            <Row label="In Maintenance" value={String(inMaintenance)} tone="warning" />
            <Row label="Total Seating Capacity" value={String(vehicleRows.reduce((s, v) => s + v.capacity, 0))} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="staff">
          <SectionCard title="Driver & Attendant Report" subtitle="Transport staff roster">
            <Row label="Total Drivers" value={String(driverRows.length)} />
            <Row label="Active Drivers" value={String(driverRows.filter((d) => d.status === "Active").length)} tone="success" />
            <Row label="Total Attendants" value={String(attendantRows.length)} />
            <Row
              label="Active Attendants"
              value={String(attendantRows.filter((a) => a.status === "Active").length)}
              tone="success"
            />
            <Row
              label="Unassigned Drivers"
              value={String(driverRows.filter((d) => !d.assigned_vehicle_id).length)}
              tone="warning"
            />
          </SectionCard>
        </TabsContent>

        <TabsContent value="students">
          <SectionCard title="Student Transport Report" subtitle="Assignment coverage">
            <Row label="Total Students" value={String(studentRows.length)} />
            <Row label="On Transport" value={String(assignedStudents)} tone="success" />
            <Row label="Not Assigned" value={String(studentRows.length - assignedStudents)} tone="warning" />
          </SectionCard>
        </TabsContent>

        <TabsContent value="attendance">
          <SectionCard title="Attendance Report" subtitle={`Today (${today})`}>
            <Row label="Marked Records" value={String(attendanceToday.length)} />
            <Row label="Boarded" value={String(boardedToday)} tone="success" />
            <Row label="Absent" value={String(absentToday)} tone="danger" />
          </SectionCard>
        </TabsContent>

        <TabsContent value="maintenance">
          <SectionCard title="Maintenance Report" subtitle="Service history and cost">
            <Row label="Total Records" value={String(maintenanceRows.length)} />
            <Row label="Total Cost" value={`₹${totalMaintenanceCost.toLocaleString()}`} />
            <Row label="This Month" value={`₹${maintenanceThisMonth.toLocaleString()}`} />
            <Row label="Upcoming Services" value={String(upcomingServices)} tone="warning" />
          </SectionCard>
        </TabsContent>

        <TabsContent value="fees">
          <SectionCard title="Transport Fee Report" subtitle="Read-only — collection handled by Accounts">
            <Row label="Total Billed" value={`₹${feeBilled.toLocaleString()}`} />
            <Row label="Collected" value={`₹${feeCollected.toLocaleString()}`} tone="success" />
            <Row label="Outstanding" value={`₹${(feeBilled - feeCollected).toLocaleString()}`} tone="warning" />
          </SectionCard>
        </TabsContent>

        <TabsContent value="complaints">
          <SectionCard title="Safety & Complaints Report" subtitle="Incidents and resolutions">
            <Row label="Total Records" value={String(complaintRows.length)} />
            <Row label="Open / In Progress" value={String(openComplaints)} tone="danger" />
            <Row label="Resolved / Closed" value={String(resolvedComplaints)} tone="success" />
            {byCategory.length > 0 && (
              <div className="mt-3 space-y-1">
                {byCategory.map(([category, count]) => (
                  <Row key={category} label={category} value={String(count)} />
                ))}
              </div>
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
