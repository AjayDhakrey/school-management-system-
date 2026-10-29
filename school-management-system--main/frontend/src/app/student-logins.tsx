import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  KeyRound,
  RotateCcw,
  UserPlus,
  Users,
  Hourglass,
} from "lucide-react";
import { PageHeader, EmptyState, TableSkeleton, Initials } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { InfoCard } from "@/components/shared/InfoCard";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useClasses,
  useMyTeacherProfile,
  useStudentLogins,
  type ApiClass,
  type ApiStudentLogin,
} from "@/hooks/useApi";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

type CreateResult = {
  created: { student_id: string; name: string; student_code: string }[];
  /** Older email logins moved onto the Student ID. */
  switched?: { student_id: string; name: string; student_code: string }[];
  skipped: { student_id: string; name: string; reason: string }[];
  existing: number;
};

/** "2016-03-14" -> "14032016", the starting password. */
const dobPassword = (dob: string) => {
  const [y, m, d] = dob.slice(0, 10).split("-");
  return `${d}${m}${y}`;
};
const fmtDob = (dob: string) =>
  new Date(`${dob.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

type Status = "active" | "first-login" | "email" | "ready" | "no-dob";
function statusOf(s: ApiStudentLogin): Status {
  if (s.has_login && !s.login_is_student_id) return s.dob ? "email" : "no-dob";
  if (s.has_login) return s.must_change_password ? "first-login" : "active";
  return s.dob ? "ready" : "no-dob";
}
const STATUS_UI: Record<Status, { label: string; tone: string }> = {
  active: { label: "Active", tone: "bg-success-soft text-success" },
  "first-login": { label: "Waiting for first login", tone: "bg-info-soft text-info" },
  email: { label: "Email login — will switch to ID", tone: "bg-warning-soft text-warning" },
  ready: { label: "No login yet", tone: "bg-warning-soft text-warning" },
  "no-dob": { label: "Date of birth missing", tone: "bg-destructive-soft text-destructive" },
};

export default function StudentLoginsPage() {
  const { user } = useAuth();
  const isTeacher = user?.role === "TEACHER";
  const { data: classes } = useClasses();
  const { data: teacher } = useMyTeacherProfile(isTeacher);
  const activeClasses = useMemo(
    () =>
      (classes ?? [])
        .filter((c) => c.status === "ACTIVE")
        .sort((a, b) =>
          `${a.name}-${a.section}`.localeCompare(`${b.name}-${b.section}`, undefined, {
            numeric: true,
          }),
        ),
    [classes],
  );
  // A teacher manages only the class they are Class Teacher of.
  const ownClass = isTeacher
    ? activeClasses.find((c) => teacher && c.class_teacher_id === teacher.id)
    : undefined;
  const [pickedId, setPickedId] = useState("");
  const classId = isTeacher ? ownClass?.id : pickedId || activeClasses[0]?.id;
  const cls = activeClasses.find((c) => c.id === classId);

  return (
    <div>
      <PageHeader
        title="Student Logins"
        description="Give every student a Student ID to sign in with — no email needed."
        breadcrumb={["Students", "Student Logins"]}
      />

      <div className="mb-4 rounded-2xl border border-info/25 bg-info-soft/40 px-4 py-3 text-sm">
        <p className="font-semibold">How it works</p>
        <p className="mt-0.5 text-muted-foreground">
          Each student signs in with their{" "}
          <span className="font-medium text-foreground">Student ID</span> and their{" "}
          <span className="font-medium text-foreground">date of birth (DDMMYYYY)</span> as the first
          password, then must choose a new password. New admissions get a login automatically; use
          “Create / switch logins” for anyone still missing one. Students who used to sign in with
          an email are switched to their Student ID the same way.
        </p>
      </div>

      {isTeacher && !ownClass ? (
        <div className="panel">
          <EmptyState
            title="You're not a class teacher"
            description="Only the class teacher of a section (or the school admin) manages its student logins."
            icon={KeyRound}
          />
        </div>
      ) : (
        <>
          {!isTeacher && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Class</span>
              <Select value={classId ?? ""} onValueChange={setPickedId}>
                <SelectTrigger className="h-9 w-[200px] bg-surface text-sm">
                  <SelectValue placeholder="Choose a class" />
                </SelectTrigger>
                <SelectContent>
                  {activeClasses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}-{c.section}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {cls ? (
            <ClassLogins key={cls.id} cls={cls} />
          ) : (
            <div className="panel">
              <EmptyState title="No classes yet" description="Add a class first." icon={Users} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ClassLogins({ cls }: { cls: ApiClass }) {
  const queryClient = useQueryClient();
  const { data: rows = [], isLoading, error } = useStudentLogins(cls.id);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<CreateResult | null>(null);
  const [resetTarget, setResetTarget] = useState<ApiStudentLogin | null>(null);
  const [exporting, setExporting] = useState(false);
  const label = `${cls.name}-${cls.section}`;

  const counts = useMemo(() => {
    const by = (st: Status) => rows.filter((r) => statusOf(r) === st).length;
    return {
      total: rows.length,
      active: by("active"),
      firstLogin: by("first-login"),
      // New logins to create plus email logins to switch onto the Student ID.
      ready: by("ready") + by("email"),
      noDob: by("no-dob"),
    };
  }, [rows]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: [`student-logins-${cls.id}`] });
  }

  async function createLogins() {
    setCreating(true);
    try {
      const res = await api.post<CreateResult>("/student-logins/create", { classId: cls.id });
      setResult(res);
      const switchedCount = res.switched?.length ?? 0;
      if (res.created.length || switchedCount) {
        toast.success(
          [
            res.created.length &&
              `${res.created.length} login${res.created.length === 1 ? "" : "s"} created`,
            switchedCount && `${switchedCount} switched from email to Student ID`,
          ]
            .filter(Boolean)
            .join(", ") + ` for ${label}`,
        );
      } else {
        toast.info("No new logins were needed");
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't create the logins");
    } finally {
      await refresh();
      setCreating(false);
    }
  }

  async function resetPassword(student: ApiStudentLogin) {
    try {
      await api.post(`/student-logins/${student.student_id}/reset`, {});
      toast.success(`${student.name}'s password is their date of birth again`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't reset the password");
    } finally {
      setResetTarget(null);
    }
  }

  async function downloadSheet() {
    setExporting(true);
    try {
      const { default: ExcelJS } = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet(label);
      sheet.mergeCells(1, 1, 1, 5);
      sheet.getCell(1, 1).value = `Student logins — Class ${label}`;
      sheet.getCell(1, 1).font = { bold: true, size: 14 };
      sheet.getRow(2).values = [
        "Sign in with the Student ID. First password = date of birth (DDMMYYYY); a new one is set at first login.",
      ];
      sheet.getCell(2, 1).font = { italic: true, size: 9, color: { argb: "FF6B7280" } };
      const header = sheet.getRow(3);
      header.values = ["Roll", "Student", "Student ID", "First password", "Status"];
      header.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF5F9AF8" } };
      });
      for (const r of rows) {
        const st = statusOf(r);
        sheet.addRow([
          r.roll ?? "",
          r.name,
          r.student_code ?? "",
          st === "first-login" && r.dob
            ? dobPassword(r.dob)
            : st === "active"
              ? "Changed by student"
              : "",
          STATUS_UI[st].label,
        ]);
      }
      [7, 28, 16, 18, 24].forEach((w, i) => (sheet.getColumn(i + 1).width = w));
      const buffer = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(
        new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `student-logins-${label}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create the sheet");
    } finally {
      setExporting(false);
    }
  }

  if (error) {
    const message = error instanceof Error ? error.message : "";
    return (
      <div className="panel">
        <EmptyState
          title="Student logins aren't set up yet"
          description={
            /class_student_logins|schema cache/i.test(message)
              ? "Run migration 77_student_login_ids.sql in Supabase, then refresh."
              : message || "Couldn't load this class."
          }
          icon={AlertTriangle}
        />
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <InfoCard label="Students" value={counts.total} icon={Users} tone="navy" />
        <InfoCard label="Logins active" value={counts.active} icon={CheckCircle2} tone="success" />
        <InfoCard
          label="Waiting for first login"
          value={counts.firstLogin}
          icon={Hourglass}
          tone="info"
        />
        <InfoCard
          label="Still need a login"
          value={counts.ready + counts.noDob}
          icon={UserPlus}
          tone={counts.ready + counts.noDob ? "gold" : "success"}
        />
      </div>

      {result &&
        (result.created.length > 0 ||
          (result.switched?.length ?? 0) > 0 ||
          result.skipped.length > 0) && (
          <div className="mb-4 rounded-2xl border border-border bg-card p-4 text-sm">
            {result.created.length > 0 && (
              <p>
                <span className="font-semibold text-success">
                  {result.created.length} login{result.created.length === 1 ? "" : "s"} created.
                </span>{" "}
                Download the login sheet below and hand each student their Student ID.
              </p>
            )}
            {(result.switched?.length ?? 0) > 0 && (
              <p className="mt-1">
                <span className="font-semibold text-info">
                  {result.switched!.length} switched from email to Student ID
                </span>{" "}
                ({result.switched!.map((s) => s.name).join(", ")}). Their old email and password no
                longer work — they sign in with their Student ID and date of birth, then set a new
                password.
              </p>
            )}
            {result.skipped.length > 0 && (
              <div className="mt-2">
                <p className="font-semibold text-warning">
                  {result.skipped.length} skipped — fix these and click “Create logins” again:
                </p>
                <ul className="mt-1 list-inside list-disc text-muted-foreground">
                  {result.skipped.map((s) => (
                    <li key={s.student_id}>
                      {s.name}: {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

      <SectionCard
        title={`Class ${label}`}
        subtitle={`${counts.total} students`}
        bodyClassName="p-0"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => void downloadSheet()}
              disabled={exporting || rows.length === 0}
            >
              <Download className="h-4 w-4" />
              {exporting ? "Preparing…" : "Login sheet"}
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => void createLogins()}
              disabled={creating || counts.ready === 0}
            >
              <UserPlus className="h-4 w-4" />
              {creating
                ? "Creating…"
                : counts.ready
                  ? `Create / switch logins (${counts.ready})`
                  : "All logins ready"}
            </Button>
          </div>
        }
      >
        {isLoading ? (
          <div className="p-4">
            <TableSkeleton rows={6} cols={5} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="No students in this class" description="Enrol students first." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14 pl-5">Roll</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Student ID</TableHead>
                  <TableHead>Date of birth</TableHead>
                  <TableHead>Login</TableHead>
                  <TableHead className="pr-5 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const st = statusOf(r);
                  return (
                    <TableRow key={r.student_id}>
                      <TableCell className="pl-5 text-muted-foreground">{r.roll ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex min-w-[160px] items-center gap-2.5">
                          <Initials name={r.name} tone="info" />
                          <span className="truncate font-medium">{r.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm font-semibold tracking-wide">
                        {r.student_code ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {r.dob ? fmtDob(r.dob) : <span className="text-destructive">Missing</span>}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
                            STATUS_UI[st].tone,
                          )}
                        >
                          {STATUS_UI[st].label}
                        </span>
                      </TableCell>
                      <TableCell className="pr-5 text-right">
                        {(st === "active" || st === "first-login") && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5"
                            onClick={() => setResetTarget(r)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> Reset password
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      <AlertDialog open={!!resetTarget} onOpenChange={(o) => !o && setResetTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset {resetTarget?.name}&apos;s password?</AlertDialogTitle>
            <AlertDialogDescription>
              Their password goes back to their date of birth
              {resetTarget?.dob ? ` (${dobPassword(resetTarget.dob)})` : ""}, and they must choose a
              new one the next time they sign in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => resetTarget && void resetPassword(resetTarget)}>
              Reset password
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
