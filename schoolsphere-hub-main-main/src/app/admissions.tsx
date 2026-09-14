"use client";

import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  PageHeader,
  EmptyState,
  ErrorState,
  SearchInput,
  FilterSelect,
  Initials,
  Pager,
  usePaged,
  TableSkeleton,
} from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { InfoCard } from "@/components/shared/InfoCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
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
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  FileText,
  Eye,
  UserPlus,
  FilePlus2,
  Users2,
  Hourglass,
  CheckCircle2,
  GraduationCap,
  Upload,
  Trash2,
  ShieldCheck,
  ShieldX,
  StickyNote,
  History as HistoryIcon,
  AlertTriangle,
  Download,
  Pencil,
  X,
  CalendarIcon,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  useAdmissions,
  useAdmissionDetail,
  useClasses,
  useSchoolProfile,
  type ApiAdmission,
  type AdmissionStage,
  type ApiAdmissionDuplicateMatch,
  type ApiAdmissionDocument,
} from "@/hooks/useApi";

const NONE = "__none__";

const STAGE_LABEL: Record<AdmissionStage, string> = {
  ENQUIRY: "Enquiry",
  APPLICATION: "Application",
  DOCUMENT_VERIFICATION: "Document Verification",
  UNDER_REVIEW: "Under Review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  WAITLISTED: "Waitlisted",
  CONVERTED: "Converted",
};
const LABEL_TO_STAGE = Object.fromEntries(
  (Object.entries(STAGE_LABEL) as [AdmissionStage, string][]).map(([stage, label]) => [label, stage]),
) as Record<string, AdmissionStage>;
const STAGE_FILTER_OPTIONS = Object.values(STAGE_LABEL);

const PIPELINE_STEPS: AdmissionStage[] = ["ENQUIRY", "APPLICATION", "DOCUMENT_VERIFICATION", "UNDER_REVIEW", "APPROVED", "CONVERTED"];
const RELATIONS = ["Father", "Mother", "Guardian"];
const GENDERS = ["Male", "Female", "Other"];
const SORT_OPTIONS = ["Newest First", "Oldest First", "Name A-Z", "Name Z-A"];
const DOC_TYPES = ["Birth Certificate", "Previous Report Card", "Transfer Certificate", "ID Proof", "Photograph", "Other"];

function canManageAdmissions(user: ReturnType<typeof useAuth>["user"]) {
  return user?.role === "SCHOOL_ADMIN" || (user?.role === "STAFF" && user?.department === "ADMIN");
}

function toISODate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * A native <input type="date"> opens on the current month with no fast way to jump back a
 * decade+ for a birth year — every "previous month" click just re-renders the same disabled
 * empty state, which reads as "past dates are inactive". This uses month/year dropdowns instead
 * so any past date is reachable in two clicks, while future dates stay disabled (DOB can't be ahead of today).
 */
function DobPicker({ value, onChange, placeholder = "Select date of birth" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const selected = value ? new Date(`${value}T00:00:00`) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("h-9 w-full justify-start bg-surface text-left font-normal", !value && "text-muted-foreground")}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          {selected ? selected.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? new Date(today.getFullYear() - 10, today.getMonth())}
          captionLayout="dropdown"
          startMonth={new Date(today.getFullYear() - 100, 0)}
          endMonth={today}
          disabled={{ after: today }}
          onSelect={(date) => {
            if (!date) return;
            onChange(toISODate(date));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export default function Page() {
  const { user } = useAuth();
  const canManage = canManageAdmissions(user);
  const { data: admissions, isLoading, isError, refetch } = useAdmissions();
  const { data: classes } = useClasses();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
  const [sort, setSort] = useState<string>("Newest First");
  const [page, setPage] = useState(1);

  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const [applicationOpen, setApplicationOpen] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const rows = admissions ?? [];

  const classOptions = useMemo(() => Array.from(new Set(rows.map((a) => a.class_applied).filter(Boolean))) as string[], [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((a) => {
      const matchesSearch =
        q === "" ||
        a.applicant.toLowerCase().includes(q) ||
        (a.parent_name ?? "").toLowerCase().includes(q) ||
        (a.contact_phone ?? "").toLowerCase().includes(q) ||
        (a.contact_email ?? "").toLowerCase().includes(q) ||
        (a.application_no ?? "").toLowerCase().includes(q);
      const matchesStage = stageFilter === "all" || a.stage === LABEL_TO_STAGE[stageFilter];
      const matchesClass = classFilter === "all" || a.class_applied === classFilter;
      return matchesSearch && matchesStage && matchesClass;
    });
  }, [rows, search, stageFilter, classFilter]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    switch (sort) {
      case "Oldest First":
        return copy.sort((a, b) => a.created_at.localeCompare(b.created_at));
      case "Name A-Z":
        return copy.sort((a, b) => a.applicant.localeCompare(b.applicant));
      case "Name Z-A":
        return copy.sort((a, b) => b.applicant.localeCompare(a.applicant));
      default:
        return copy.sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
  }, [filtered, sort]);

  const { rows: paged, pageCount } = usePaged(sorted, page, 8);

  const counts = useMemo(() => {
    const inProgress = rows.filter((a) =>
      (["APPLICATION", "DOCUMENT_VERIFICATION", "UNDER_REVIEW", "WAITLISTED"] as AdmissionStage[]).includes(a.stage),
    ).length;
    return {
      total: rows.length,
      enquiries: rows.filter((a) => a.stage === "ENQUIRY").length,
      inProgress,
      approved: rows.filter((a) => a.stage === "APPROVED").length,
      converted: rows.filter((a) => a.stage === "CONVERTED").length,
    };
  }, [rows]);

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ["admissions"] });
  }

  return (
    <div>
      <PageHeader
        title="Admission Management"
        description="Track enquiries through to enrolment — review documents, verify details and convert approved applicants to students."
        breadcrumb={["Dashboard", "Admissions"]}
        actions={
          canManage ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEnquiryOpen(true)}>
                <UserPlus className="h-4 w-4" /> New Enquiry
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => setApplicationOpen(true)}>
                <FilePlus2 className="h-4 w-4" /> New Application
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard label="Total Applications" value={counts.total} icon={FileText} tone="navy" />
        <InfoCard label="New Enquiries" value={counts.enquiries} icon={Users2} tone="info" />
        <InfoCard label="Pending Review" value={counts.inProgress} icon={Hourglass} tone="warning" />
        <InfoCard label="Converted to Students" value={counts.converted} icon={CheckCircle2} tone="success" />
      </div>

      <SectionCard bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search applicant, parent, phone, email, App No…" />
          <FilterSelect value={stageFilter} onChange={(v) => { setStageFilter(v); setPage(1); }} options={STAGE_FILTER_OPTIONS} placeholder="Stage" />
          <FilterSelect value={classFilter} onChange={(v) => { setClassFilter(v); setPage(1); }} options={classOptions} placeholder="Class Applied" />
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="h-9 w-full bg-surface text-sm sm:w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o} value={o}>{o}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : paged.length === 0 ? (
          <EmptyState
            title={rows.length === 0 ? "No admissions yet" : "No applications found"}
            description={rows.length === 0 ? "New enquiries and applications will appear here." : "Try adjusting your search or filters."}
            icon={FileText}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Applicant</th>
                  <th className="px-4 py-2.5 font-medium">Application No.</th>
                  <th className="px-4 py-2.5 font-medium">Class Applied</th>
                  <th className="px-4 py-2.5 font-medium">Parent / Guardian</th>
                  <th className="px-4 py-2.5 font-medium">Applied On</th>
                  <th className="px-4 py-2.5 font-medium">Stage</th>
                  <th className="px-4 py-2.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Initials name={a.applicant} className="h-8 w-8" />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{a.applicant}</p>
                          {a.stage === "CONVERTED" && a.admission_no && (
                            <p className="truncate text-[11px] text-success">Admission No. {a.admission_no}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap font-mono text-xs text-muted-foreground">{a.application_no ?? "—"}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                      {a.class_applied ?? "—"}{a.section_applied ? `-${a.section_applied}` : ""}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{a.parent_name ?? "—"}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{a.applied_on ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={STAGE_LABEL[a.stage]} />
                    </td>
                    <td className="px-4 py-2.5">
                      <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setReviewingId(a.id)}>
                        <Eye className="h-3.5 w-3.5" /> Review
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} pageCount={pageCount} onPage={setPage} total={sorted.length} />
      </SectionCard>

      <NewAdmissionDialog
        key={enquiryOpen ? "enquiry-open" : "enquiry-closed"}
        open={enquiryOpen}
        onOpenChange={setEnquiryOpen}
        mode="enquiry"
        classes={classes ?? []}
        onCreated={async () => {
          await invalidate();
          setEnquiryOpen(false);
        }}
      />
      <NewAdmissionDialog
        key={applicationOpen ? "application-open" : "application-closed"}
        open={applicationOpen}
        onOpenChange={setApplicationOpen}
        mode="application"
        classes={classes ?? []}
        onCreated={async () => {
          await invalidate();
          setApplicationOpen(false);
        }}
      />

      <Sheet open={!!reviewingId} onOpenChange={(o) => !o && setReviewingId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          {reviewingId && (
            <AdmissionReviewPanel
              admissionId={reviewingId}
              canManage={canManage}
              classes={classes ?? []}
              onClose={() => setReviewingId(null)}
              onChanged={invalidate}
              onConverted={(studentId) => {
                setReviewingId(null);
                navigate(`/students/${studentId}`);
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ---------------------------------------------------------------------------
// New Enquiry / New Application
// ---------------------------------------------------------------------------

type NewAdmissionForm = {
  applicant: string;
  dob: string;
  gender: string;
  address: string;
  classId: string;
  academicYear: string;
  parentName: string;
  parentRelation: string;
  contactPhone: string;
  contactEmail: string;
  previousSchool: string;
  previousClass: string;
  previousBoard: string;
  previousPercentage: string;
};

const emptyForm: NewAdmissionForm = {
  applicant: "",
  dob: "",
  gender: "",
  address: "",
  classId: NONE,
  academicYear: "",
  parentName: "",
  parentRelation: "",
  contactPhone: "",
  contactEmail: "",
  previousSchool: "",
  previousClass: "",
  previousBoard: "",
  previousPercentage: "",
};

function NewAdmissionDialog({
  open,
  onOpenChange,
  mode,
  classes,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode: "enquiry" | "application";
  classes: { id: string; name: string; section: string; academic_year_id: string | null; academic_year_name: string | null }[];
  onCreated: () => void;
}) {
  const { data: school } = useSchoolProfile();
  const [form, setForm] = useState<NewAdmissionForm>({
    ...emptyForm,
    academicYear: school?.session ?? "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [duplicates, setDuplicates] = useState<ApiAdmissionDuplicateMatch[] | null>(null);

  function set<K extends keyof NewAdmissionForm>(key: K, value: NewAdmissionForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function reset() {
    setForm({ ...emptyForm, academicYear: school?.session ?? "" });
    setDuplicates(null);
  }

  async function submit(force: boolean) {
    if (!form.applicant.trim()) {
      toast.error("Applicant name is required");
      return;
    }
    if (!form.contactPhone.trim() && !form.contactEmail.trim()) {
      toast.error("Provide at least a contact phone or email");
      return;
    }
    const selectedClass = classes.find((c) => c.id === form.classId);
    setSubmitting(true);
    try {
      const resp = await api.post<{ id: string; applicationNo: string }>("/admissions", {
        applicant: form.applicant.trim(),
        dob: form.dob || null,
        gender: form.gender || null,
        address: form.address.trim() || null,
        classApplied: selectedClass?.name ?? null,
        sectionApplied: selectedClass?.section ?? null,
        classIdApplied: selectedClass?.id ?? null,
        academicYearId: selectedClass?.academic_year_id ?? null,
        academicYear: form.academicYear.trim() || null,
        parentName: form.parentName.trim() || null,
        parentRelation: form.parentRelation || null,
        contactPhone: form.contactPhone.trim() || null,
        contactEmail: form.contactEmail.trim() || null,
        previousSchool: mode === "application" ? form.previousSchool.trim() || null : null,
        previousClass: mode === "application" ? form.previousClass.trim() || null : null,
        previousBoard: mode === "application" ? form.previousBoard.trim() || null : null,
        previousPercentage: mode === "application" ? form.previousPercentage.trim() || null : null,
        stage: mode === "application" ? "APPLICATION" : "ENQUIRY",
        force,
      });
      toast.success(`${mode === "enquiry" ? "Enquiry" : "Application"} recorded — ${resp.applicationNo}`);
      reset();
      onCreated();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const body = err.details as { duplicates?: ApiAdmissionDuplicateMatch[] } | undefined;
        setDuplicates(body?.duplicates ?? []);
        return;
      }
      toast.error(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submit(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "enquiry" ? "New Enquiry" : "New Application"}</DialogTitle>
          <DialogDescription>
            {mode === "enquiry"
              ? "Quickly capture a walk-in or phone enquiry. Full details can be added later."
              : "Full application intake with applicant, parent/guardian and previous school details."}
          </DialogDescription>
        </DialogHeader>

        {duplicates && (
          <div className="rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm">
            <div className="mb-1.5 flex items-center gap-1.5 font-semibold text-warning">
              <AlertTriangle className="h-4 w-4" /> Possible duplicate found
            </div>
            <ul className="mb-2 list-inside list-disc space-y-0.5 text-xs text-foreground/80">
              {duplicates.map((d) => (
                <li key={`${d.type}-${d.id}`}>{d.label}</li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-8" onClick={() => setDuplicates(null)}>
                Go back
              </Button>
              <Button size="sm" className="h-8" disabled={submitting} onClick={() => submit(true)}>
                Submit anyway
              </Button>
            </div>
          </div>
        )}

        <form className="grid gap-3" onSubmit={handleSubmit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Applicant Name</Label>
              <Input required value={form.applicant} onChange={(e) => set("applicant", e.target.value)} placeholder="Full name" />
            </div>
            <div className="space-y-1">
              <Label>Date of Birth</Label>
              <DobPicker value={form.dob} onChange={(v) => set("dob", v)} />
            </div>
            {mode === "application" && (
              <div className="space-y-1">
                <Label>Gender</Label>
                <Select value={form.gender} onValueChange={(v) => set("gender", v)}>
                  <SelectTrigger className="bg-surface"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{GENDERS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label>Class Applied For</Label>
              <Select value={form.classId} onValueChange={(v) => set("classId", v)}>
                <SelectTrigger className="bg-surface"><SelectValue placeholder="Select class & section" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not decided yet</SelectItem>
                  {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}-{c.section}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Academic Year</Label>
              <Input value={form.academicYear} onChange={(e) => set("academicYear", e.target.value)} placeholder="2026-2027" />
            </div>
            {mode === "application" && (
              <div className="space-y-1 sm:col-span-2">
                <Label>Address</Label>
                <Input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Full address" />
              </div>
            )}
          </div>

          <Separator />
          <p className="text-xs font-semibold uppercase text-muted-foreground">Parent / Guardian Details</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Parent / Guardian Name</Label>
              <Input value={form.parentName} onChange={(e) => set("parentName", e.target.value)} placeholder="Full name" />
            </div>
            <div className="space-y-1">
              <Label>Relation</Label>
              <Select value={form.parentRelation} onValueChange={(v) => set("parentRelation", v)}>
                <SelectTrigger className="bg-surface"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{RELATIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Contact Phone</Label>
              <Input value={form.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} placeholder="Phone number" />
            </div>
            <div className="space-y-1">
              <Label>Contact Email</Label>
              <Input type="email" value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} placeholder="Email address" />
            </div>
          </div>

          {mode === "application" && (
            <>
              <Separator />
              <p className="text-xs font-semibold uppercase text-muted-foreground">Previous School / Academic Details</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Previous School</Label>
                  <Input value={form.previousSchool} onChange={(e) => set("previousSchool", e.target.value)} placeholder="School name" />
                </div>
                <div className="space-y-1">
                  <Label>Previous Class</Label>
                  <Input value={form.previousClass} onChange={(e) => set("previousClass", e.target.value)} placeholder="e.g. Grade 4" />
                </div>
                <div className="space-y-1">
                  <Label>Board</Label>
                  <Input value={form.previousBoard} onChange={(e) => set("previousBoard", e.target.value)} placeholder="e.g. CBSE" />
                </div>
                <div className="space-y-1">
                  <Label>Result (%/Grade)</Label>
                  <Input value={form.previousPercentage} onChange={(e) => set("previousPercentage", e.target.value)} placeholder="e.g. 88%" />
                </div>
              </div>
            </>
          )}

          <DialogFooter>
            <Button type="submit" disabled={submitting || !!duplicates}>
              {submitting ? "Saving…" : mode === "enquiry" ? "Save Enquiry" : "Save Application"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Review Panel
// ---------------------------------------------------------------------------

function AdmissionReviewPanel({
  admissionId,
  canManage,
  classes,
  onClose,
  onChanged,
  onConverted,
}: {
  admissionId: string;
  canManage: boolean;
  classes: { id: string; name: string; section: string; academic_year_id: string | null; academic_year_name: string | null }[];
  onClose: () => void;
  onChanged: () => Promise<void>;
  onConverted: (studentId: string) => void;
}) {
  const { data: detail, isLoading, isError, refetch } = useAdmissionDetail(admissionId);
  const [transitionTarget, setTransitionTarget] = useState<{ toStage: AdmissionStage; title: string; remarksRequired: boolean } | null>(null);
  const [convertOpen, setConvertOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    await refetch();
    await onChanged();
  }

  async function runTransition(remarks?: string) {
    if (!transitionTarget) return;
    setBusy(true);
    try {
      await api.post(`/admissions/${admissionId}/transition`, { toStage: transitionTarget.toStage, remarks: remarks ?? null });
      toast.success(`Moved to ${STAGE_LABEL[transitionTarget.toStage]}`);
      setTransitionTarget(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update stage");
    } finally {
      setBusy(false);
    }
  }

  async function handleConvert() {
    setBusy(true);
    try {
      const resp = await api.post<{ studentId: string; admissionNo: string }>(`/admissions/${admissionId}/convert`);
      toast.success(`Converted to student — Admission No. ${resp.admissionNo}`);
      setConvertOpen(false);
      await onChanged();
      onConverted(resp.studentId);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to convert to student");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await api.delete(`/admissions/${admissionId}`);
      toast.success("Application removed");
      setDeleteOpen(false);
      await onChanged();
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to remove application");
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return (
      <>
        <SheetHeader><SheetTitle>Application Review</SheetTitle></SheetHeader>
        <TableSkeleton rows={5} cols={2} />
      </>
    );
  }
  if (isError || !detail) {
    return (
      <>
        <SheetHeader><SheetTitle>Application Review</SheetTitle></SheetHeader>
        <ErrorState onRetry={() => refetch()} />
      </>
    );
  }

  const isConverted = detail.stage === "CONVERTED";
  const nextActions = actionsForStage(detail.stage);

  return (
    <div className="flex h-full flex-col">
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          {detail.applicant}
          <StatusBadge status={STAGE_LABEL[detail.stage]} />
        </SheetTitle>
        <SheetDescription>
          {detail.application_no ?? "No application number"} · Applied {detail.applied_on ?? "—"}
          {detail.admission_no && <> · Admission No. {detail.admission_no}</>}
        </SheetDescription>
      </SheetHeader>

      <div className="mt-2 flex-1 space-y-4 overflow-y-auto px-1 pb-4">
        <PipelineTracker stage={detail.stage} />

        <Tabs defaultValue="overview">
          <TabsList className="w-full">
            <TabsTrigger value="overview" className="flex-1">Overview</TabsTrigger>
            <TabsTrigger value="documents" className="flex-1">Documents ({detail.documentsList.length})</TabsTrigger>
            <TabsTrigger value="notes" className="flex-1">Notes ({detail.notesList.length})</TabsTrigger>
            <TabsTrigger value="history" className="flex-1">History</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <OverviewTab
              admission={detail}
              canManage={canManage && !isConverted}
              classes={classes}
              editOpen={editOpen}
              setEditOpen={setEditOpen}
              onSaved={refresh}
            />
          </TabsContent>

          <TabsContent value="documents">
            <DocumentsTab admissionId={admissionId} documents={detail.documentsList} canManage={canManage && !isConverted} onChanged={refresh} />
          </TabsContent>

          <TabsContent value="notes">
            <NotesTab admissionId={admissionId} notes={detail.notesList} canManage={canManage} onChanged={refresh} />
          </TabsContent>

          <TabsContent value="history">
            <HistoryTab history={detail.history} />
          </TabsContent>
        </Tabs>
      </div>

      {canManage && (
        <div className="border-t border-border pt-3">
          <div className="flex flex-wrap gap-2">
            {nextActions.map((action) => (
              <Button
                key={action.toStage}
                size="sm"
                variant={action.variant}
                className="gap-1.5"
                onClick={() => setTransitionTarget({ toStage: action.toStage, title: action.title, remarksRequired: action.remarksRequired })}
              >
                <action.icon className="h-3.5 w-3.5" /> {action.title}
              </Button>
            ))}
            {detail.stage === "APPROVED" && (
              <Button size="sm" className="gap-1.5" onClick={() => setConvertOpen(true)}>
                <GraduationCap className="h-3.5 w-3.5" /> Convert to Student
              </Button>
            )}
            {!isConverted && (
              <Button size="sm" variant="ghost" className="ml-auto gap-1.5 text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Stage transition confirm */}
      <Dialog open={!!transitionTarget} onOpenChange={(o) => !o && setTransitionTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{transitionTarget?.title}</DialogTitle>
            <DialogDescription>
              Move {detail.applicant}&rsquo;s application to {transitionTarget ? STAGE_LABEL[transitionTarget.toStage] : ""}.
            </DialogDescription>
          </DialogHeader>
          <RemarksForm
            required={transitionTarget?.remarksRequired ?? false}
            submitting={busy}
            confirmLabel={transitionTarget?.title ?? "Confirm"}
            onSubmit={runTransition}
          />
        </DialogContent>
      </Dialog>

      {/* Convert confirm */}
      <AlertDialog open={convertOpen} onOpenChange={setConvertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convert to Student?</AlertDialogTitle>
            <AlertDialogDescription>
              This creates a real, enrolled student record for {detail.applicant} with a new admission number, and links their verified
              details and parent/guardian. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); handleConvert(); }}>
              {busy ? "Converting…" : "Convert to Student"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this application?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes {detail.applicant}&rsquo;s application, documents, notes and history. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} className="bg-destructive hover:bg-destructive/90" onClick={(e) => { e.preventDefault(); handleDelete(); }}>
              {busy ? "Removing…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function actionsForStage(stage: AdmissionStage) {
  type Action = { toStage: AdmissionStage; title: string; icon: typeof ShieldCheck; variant: "default" | "outline" | "secondary"; remarksRequired: boolean };
  switch (stage) {
    case "ENQUIRY":
      return [
        { toStage: "APPLICATION", title: "Move to Application", icon: FilePlus2, variant: "default", remarksRequired: false },
        { toStage: "REJECTED", title: "Reject", icon: ShieldX, variant: "outline", remarksRequired: true },
      ] satisfies Action[];
    case "APPLICATION":
      return [
        { toStage: "DOCUMENT_VERIFICATION", title: "Move to Document Verification", icon: FilePlus2, variant: "default", remarksRequired: false },
        { toStage: "REJECTED", title: "Reject", icon: ShieldX, variant: "outline", remarksRequired: true },
      ] satisfies Action[];
    case "DOCUMENT_VERIFICATION":
      return [
        { toStage: "UNDER_REVIEW", title: "Move to Under Review", icon: FilePlus2, variant: "default", remarksRequired: false },
        { toStage: "APPLICATION", title: "Send back to Application", icon: HistoryIcon, variant: "outline", remarksRequired: true },
        { toStage: "REJECTED", title: "Reject", icon: ShieldX, variant: "outline", remarksRequired: true },
      ] satisfies Action[];
    case "UNDER_REVIEW":
      return [
        { toStage: "APPROVED", title: "Approve", icon: ShieldCheck, variant: "default", remarksRequired: false },
        { toStage: "WAITLISTED", title: "Waitlist", icon: Hourglass, variant: "secondary", remarksRequired: true },
        { toStage: "REJECTED", title: "Reject", icon: ShieldX, variant: "outline", remarksRequired: true },
        { toStage: "DOCUMENT_VERIFICATION", title: "Send back for Documents", icon: HistoryIcon, variant: "outline", remarksRequired: true },
      ] satisfies Action[];
    case "WAITLISTED":
      return [
        { toStage: "UNDER_REVIEW", title: "Move back to Review", icon: HistoryIcon, variant: "outline", remarksRequired: false },
        { toStage: "APPROVED", title: "Approve", icon: ShieldCheck, variant: "default", remarksRequired: false },
        { toStage: "REJECTED", title: "Reject", icon: ShieldX, variant: "outline", remarksRequired: true },
      ] satisfies Action[];
    case "REJECTED":
      return [{ toStage: "UNDER_REVIEW", title: "Reopen for Review", icon: HistoryIcon, variant: "outline", remarksRequired: true }] satisfies Action[];
    case "APPROVED":
      return [{ toStage: "REJECTED", title: "Revoke Approval", icon: ShieldX, variant: "outline", remarksRequired: true }] satisfies Action[];
    default:
      return [] satisfies Action[];
  }
}

function RemarksForm({
  required,
  submitting,
  confirmLabel,
  onSubmit,
}: {
  required: boolean;
  submitting: boolean;
  confirmLabel: string;
  onSubmit: (remarks?: string) => void;
}) {
  const [remarks, setRemarks] = useState("");
  return (
    <div className="grid gap-3">
      <div className="space-y-1">
        <Label>Remarks {required ? "" : "(optional)"}</Label>
        <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Add a reason or note for this decision…" rows={3} />
      </div>
      <DialogFooter>
        <Button
          disabled={submitting || (required && !remarks.trim())}
          onClick={() => onSubmit(remarks.trim() || undefined)}
        >
          {submitting ? "Saving…" : confirmLabel}
        </Button>
      </DialogFooter>
    </div>
  );
}

function PipelineTracker({ stage }: { stage: AdmissionStage }) {
  if (stage === "REJECTED" || stage === "WAITLISTED") {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium",
          stage === "REJECTED" ? "border-destructive/30 bg-destructive-soft text-destructive" : "border-gold/35 bg-gold-soft text-gold-foreground",
        )}
      >
        {stage === "REJECTED" ? <ShieldX className="h-4 w-4" /> : <Hourglass className="h-4 w-4" />}
        This application is currently {STAGE_LABEL[stage]}.
      </div>
    );
  }

  const idx = PIPELINE_STEPS.indexOf(stage);
  return (
    <div className="flex items-center overflow-x-auto pb-1">
      {PIPELINE_STEPS.map((step, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <div key={step} className="flex shrink-0 items-center">
            <div className="flex flex-col items-center gap-1">
              <span
                className={cn(
                  "grid h-7 w-7 place-items-center rounded-full border text-[11px] font-bold",
                  done
                    ? "border-success bg-success text-success-foreground"
                    : active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-muted text-muted-foreground",
                )}
              >
                {i + 1}
              </span>
              <span className={cn("w-20 text-center text-[10px] leading-tight", done || active ? "font-medium text-foreground" : "text-muted-foreground")}>
                {STAGE_LABEL[step]}
              </span>
            </div>
            {i < PIPELINE_STEPS.length - 1 && (
              <span className={cn("mx-1 h-px w-8 shrink-0", done ? "bg-success" : "bg-border")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------

function OverviewTab({
  admission,
  canManage,
  classes,
  editOpen,
  setEditOpen,
  onSaved,
}: {
  admission: ApiAdmission;
  canManage: boolean;
  classes: { id: string; name: string; section: string; academic_year_id: string | null; academic_year_name: string | null }[];
  editOpen: boolean;
  setEditOpen: (o: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState<NewAdmissionForm>({
    applicant: admission.applicant,
    dob: admission.dob ?? "",
    gender: admission.gender ?? "",
    address: admission.address ?? "",
    classId: admission.class_id_applied ?? NONE,
    academicYear: admission.academic_year ?? "",
    parentName: admission.parent_name ?? "",
    parentRelation: admission.parent_relation ?? "",
    contactPhone: admission.contact_phone ?? "",
    contactEmail: admission.contact_email ?? "",
    previousSchool: admission.previous_school ?? "",
    previousClass: admission.previous_class ?? "",
    previousBoard: admission.previous_board ?? "",
    previousPercentage: admission.previous_percentage ?? "",
  });
  const [saving, setSaving] = useState(false);

  function set<K extends keyof NewAdmissionForm>(key: K, value: NewAdmissionForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    const selectedClass = classes.find((c) => c.id === form.classId);
    setSaving(true);
    try {
      await api.patch(`/admissions/${admission.id}`, {
        applicant: form.applicant.trim(),
        dob: form.dob || null,
        gender: form.gender || null,
        address: form.address.trim() || null,
        classApplied: selectedClass?.name ?? null,
        sectionApplied: selectedClass?.section ?? null,
        classIdApplied: selectedClass?.id ?? null,
        academicYearId: selectedClass?.academic_year_id ?? null,
        academicYear: form.academicYear.trim() || null,
        parentName: form.parentName.trim() || null,
        parentRelation: form.parentRelation || null,
        contactPhone: form.contactPhone.trim() || null,
        contactEmail: form.contactEmail.trim() || null,
        previousSchool: form.previousSchool.trim() || null,
        previousClass: form.previousClass.trim() || null,
        previousBoard: form.previousBoard.trim() || null,
        previousPercentage: form.previousPercentage.trim() || null,
      });
      toast.success("Application updated");
      setEditOpen(false);
      await onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update application");
    } finally {
      setSaving(false);
    }
  }

  if (editOpen) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Applicant Name"><Input value={form.applicant} onChange={(e) => set("applicant", e.target.value)} /></Field>
          <Field label="Date of Birth"><DobPicker value={form.dob} onChange={(v) => set("dob", v)} /></Field>
          <Field label="Gender">
            <Select value={form.gender} onValueChange={(v) => set("gender", v)}>
              <SelectTrigger className="bg-surface"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{GENDERS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Class Applied For">
            <Select value={form.classId} onValueChange={(v) => set("classId", v)}>
              <SelectTrigger className="bg-surface"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not decided yet</SelectItem>
                {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}-{c.section}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Academic Year"><Input value={form.academicYear} onChange={(e) => set("academicYear", e.target.value)} /></Field>
          <Field label="Address"><Input value={form.address} onChange={(e) => set("address", e.target.value)} /></Field>
        </div>
        <Separator />
        <p className="text-xs font-semibold uppercase text-muted-foreground">Parent / Guardian</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><Input value={form.parentName} onChange={(e) => set("parentName", e.target.value)} /></Field>
          <Field label="Relation">
            <Select value={form.parentRelation} onValueChange={(v) => set("parentRelation", v)}>
              <SelectTrigger className="bg-surface"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{RELATIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Phone"><Input value={form.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} /></Field>
          <Field label="Email"><Input type="email" value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} /></Field>
        </div>
        <Separator />
        <p className="text-xs font-semibold uppercase text-muted-foreground">Previous School</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="School"><Input value={form.previousSchool} onChange={(e) => set("previousSchool", e.target.value)} /></Field>
          <Field label="Class"><Input value={form.previousClass} onChange={(e) => set("previousClass", e.target.value)} /></Field>
          <Field label="Board"><Input value={form.previousBoard} onChange={(e) => set("previousBoard", e.target.value)} /></Field>
          <Field label="Result"><Input value={form.previousPercentage} onChange={(e) => set("previousPercentage", e.target.value)} /></Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5" /> Edit Details
          </Button>
        </div>
      )}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Applicant</p>
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-muted/20 p-3 text-sm">
          <ReadField label="Name" value={admission.applicant} />
          <ReadField label="Date of Birth" value={admission.dob} />
          <ReadField label="Gender" value={admission.gender} />
          <ReadField label="Class Applied" value={admission.class_applied ? `${admission.class_applied}${admission.section_applied ? `-${admission.section_applied}` : ""}` : null} />
          <ReadField label="Academic Year" value={admission.academic_year} />
          <ReadField label="Address" value={admission.address} className="col-span-2" />
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Parent / Guardian</p>
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-muted/20 p-3 text-sm">
          <ReadField label="Name" value={admission.parent_name} />
          <ReadField label="Relation" value={admission.parent_relation} />
          <ReadField label="Phone" value={admission.contact_phone} />
          <ReadField label="Email" value={admission.contact_email} />
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Previous School / Academic Details</p>
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-muted/20 p-3 text-sm">
          <ReadField label="School" value={admission.previous_school} />
          <ReadField label="Class" value={admission.previous_class} />
          <ReadField label="Board" value={admission.previous_board} />
          <ReadField label="Result" value={admission.previous_percentage} />
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Created by {admission.created_by_name ?? "—"} on {admission.created_at.slice(0, 10)}</span>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function ReadField({ label, value, className }: { label: string; value: string | null | undefined; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value || "—"}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Documents tab
// ---------------------------------------------------------------------------

function DocumentsTab({
  admissionId,
  documents,
  canManage,
  onChanged,
}: {
  admissionId: string;
  documents: ApiAdmissionDocument[];
  canManage: boolean;
  onChanged: () => Promise<void>;
}) {
  const [docName, setDocName] = useState("");
  const [docType, setDocType] = useState(DOC_TYPES[0] ?? "Other");
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<ApiAdmissionDocument | null>(null);
  const [remarksDoc, setRemarksDoc] = useState<{ doc: ApiAdmissionDocument; nextStatus: "Verified" | "Rejected" } | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      toast.error("File is too large (max 4MB)");
      return;
    }
    setUploading(true);
    try {
      const fileData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await api.post(`/admissions/${admissionId}/documents`, {
        name: docName.trim() || file.name,
        docType,
        fileData,
        fileMime: file.type,
      });
      toast.success("Document uploaded");
      setDocName("");
      await onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to upload document");
    } finally {
      setUploading(false);
    }
  }

  async function removeDoc(doc: ApiAdmissionDocument) {
    try {
      await api.delete(`/admissions/${admissionId}/documents/${doc.id}`);
      toast.success("Document removed");
      await onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to remove document");
    }
  }

  async function applyVerification(remarks?: string) {
    if (!remarksDoc) return;
    try {
      await api.patch(`/admissions/${admissionId}/documents/${remarksDoc.doc.id}`, { status: remarksDoc.nextStatus, remarks: remarks ?? null });
      toast.success(`Document marked ${remarksDoc.nextStatus}`);
      setRemarksDoc(null);
      await onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update document");
    }
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="rounded-xl border border-dashed border-border p-3">
          <div className="mb-2 grid gap-2 sm:grid-cols-2">
            <Input placeholder="Document name (optional)" value={docName} onChange={(e) => setDocName(e.target.value)} className="h-9" />
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger className="h-9 bg-surface"><SelectValue /></SelectTrigger>
              <SelectContent>{DOC_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <label className="flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border bg-surface text-xs font-medium hover:bg-muted">
            <Upload className="h-3.5 w-3.5" /> {uploading ? "Uploading…" : "Choose file to upload (max 4MB)"}
            <input type="file" className="hidden" accept="image/*,.pdf" onChange={handleFile} disabled={uploading} />
          </label>
        </div>
      )}

      {documents.length === 0 ? (
        <EmptyState title="No documents uploaded yet" description="Upload the applicant's documents for verification." icon={FileText} />
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div key={doc.id} className="rounded-lg border border-border p-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{doc.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{doc.doc_type ?? "Document"} · Uploaded by {doc.uploaded_by_name ?? "—"}</p>
                </div>
                <StatusBadge status={doc.status} />
              </div>
              {doc.remarks && <p className="mt-1.5 text-xs text-muted-foreground">Remarks: {doc.remarks}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setPreview(doc)}>
                  <Eye className="h-3 w-3" /> View
                </Button>
                {canManage && (
                  <>
                    <Button size="sm" variant="outline" className="h-7 gap-1 text-xs text-success hover:text-success" onClick={() => setRemarksDoc({ doc, nextStatus: "Verified" })}>
                      <ShieldCheck className="h-3 w-3" /> Verify
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 gap-1 text-xs text-destructive hover:text-destructive" onClick={() => setRemarksDoc({ doc, nextStatus: "Rejected" })}>
                      <ShieldX className="h-3 w-3" /> Reject
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-muted-foreground" onClick={() => removeDoc(doc)}>
                      <Trash2 className="h-3 w-3" /> Remove
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{preview?.name}</DialogTitle>
            <DialogDescription>{preview?.doc_type ?? "Document"}</DialogDescription>
          </DialogHeader>
          {preview?.file_mime?.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.file_data ?? ""} alt={preview.name} className="max-h-[60vh] w-full rounded-lg object-contain" />
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              <FileText className="h-8 w-8" />
              <p>Preview isn&rsquo;t available for this file type.</p>
              {preview?.file_data && (
                <a href={preview.file_data} download={preview.name} className="inline-flex items-center gap-1.5 text-primary hover:underline">
                  <Download className="h-4 w-4" /> Download {preview.name}
                </a>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!remarksDoc} onOpenChange={(o) => !o && setRemarksDoc(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark as {remarksDoc?.nextStatus}</DialogTitle>
            <DialogDescription>{remarksDoc?.doc.name}</DialogDescription>
          </DialogHeader>
          <RemarksForm required={false} submitting={false} confirmLabel={`Mark ${remarksDoc?.nextStatus}`} onSubmit={applyVerification} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notes tab
// ---------------------------------------------------------------------------

function NotesTab({
  admissionId,
  notes,
  canManage,
  onChanged,
}: {
  admissionId: string;
  notes: { id: string; note: string; author_name: string | null; created_at: string }[];
  canManage: boolean;
  onChanged: () => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function addNote() {
    if (!note.trim()) return;
    setSaving(true);
    try {
      await api.post(`/admissions/${admissionId}/notes`, { note: note.trim() });
      setNote("");
      await onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to add note");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="space-y-2">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add an internal note visible only to staff…" rows={3} />
          <div className="flex justify-end">
            <Button size="sm" disabled={saving || !note.trim()} onClick={addNote}>
              {saving ? "Adding…" : "Add Note"}
            </Button>
          </div>
        </div>
      )}
      {notes.length === 0 ? (
        <EmptyState title="No internal notes yet" icon={StickyNote} />
      ) : (
        <div className="space-y-2">
          {notes.map((n) => (
            <div key={n.id} className="rounded-lg border border-border p-2.5 text-sm">
              <p>{n.note}</p>
              <p className="mt-1 text-xs text-muted-foreground">{n.author_name ?? "Unknown"} · {n.created_at}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// History tab
// ---------------------------------------------------------------------------

function HistoryTab({
  history,
}: {
  history: { id: string; from_stage: string | null; to_stage: string; remarks: string | null; changed_by_name: string | null; changed_at: string }[];
}) {
  if (history.length === 0) {
    return <EmptyState title="No status changes yet" icon={HistoryIcon} />;
  }
  return (
    <div className="space-y-0">
      {history.map((h, i) => (
        <div key={h.id} className="relative flex gap-3 pb-5 last:pb-0">
          {i < history.length - 1 && <span className="absolute top-3 left-[5px] h-full w-px bg-border" />}
          <span className="relative z-10 mt-1 h-3 w-3 shrink-0 rounded-full border-2 border-primary bg-surface" />
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {h.from_stage ? `${STAGE_LABEL[h.from_stage as AdmissionStage] ?? h.from_stage} → ` : ""}
              {STAGE_LABEL[h.to_stage as AdmissionStage] ?? h.to_stage}
            </p>
            {h.remarks && <p className="text-xs text-muted-foreground">{h.remarks}</p>}
            <p className="text-xs text-muted-foreground">{h.changed_by_name ?? "System"} · {h.changed_at}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
