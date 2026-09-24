"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle,
  BookOpen,
  BookCopy,
  CheckCircle2,
  Download,
  Layers,
  Library as LibraryIcon,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Undo2,
  UserRound,
} from "lucide-react";
import {
  PageHeader,
  SearchInput,
  FilterSelect,
  EmptyState,
  Pager,
  usePaged,
  TableSkeleton,
} from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { InfoCard } from "@/components/shared/InfoCard";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { useAuth } from "@/lib/auth-context";
import {
  useHasPermission,
  useLibraryBooks,
  useLibraryBorrowers,
  useLibraryCirculation,
  useLibraryCopies,
  useLibraryRecords,
  useLibrarySettings,
  type ApiLibraryBook,
  type ApiLibraryBorrower,
  type ApiLibraryCopy,
  type ApiLibraryLoan,
  type ApiLibrarySettings,
  type LibraryBorrowerType,
  type LibraryCopyStatus,
} from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";

type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "gold";

const COPY_STATUS: Record<LibraryCopyStatus, { label: string; tone: Tone }> = {
  AVAILABLE: { label: "Available", tone: "success" },
  ISSUED: { label: "Issued", tone: "info" },
  DAMAGED: { label: "Damaged", tone: "warning" },
  LOST: { label: "Lost", tone: "danger" },
  WITHDRAWN: { label: "Withdrawn", tone: "neutral" },
};
const BORROWER_LABEL: Record<LibraryBorrowerType, string> = {
  STUDENT: "Student",
  TEACHER: "Teacher",
  STAFF: "Staff",
};
const CONDITION_LABEL = { GOOD: "Good", DAMAGED: "Damaged", LOST: "Lost" } as const;
const LIBRARY_QUERY_KEYS = [
  "library-books",
  "library-copies",
  "library-circulation",
  "library-records",
];

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/** `2026-09-23` → `23 Sep 2026`. */
function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return format(parseISO(value), "d MMM yyyy");
  } catch {
    return value;
  }
}

const todayIso = () => format(new Date(), "yyyy-MM-dd");
const addDays = (days: number) => format(new Date(Date.now() + days * 86_400_000), "yyyy-MM-dd");
const daysBetween = (from: string, to: string) =>
  Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / 86_400_000);

/** Display status of a loan (issued / due soon / overdue / returned / lost / damaged). */
function loanStatus(loan: {
  due_date?: string | null;
  returned_on?: string | null;
  return_condition?: string | null;
}): {
  label: string;
  tone: Tone;
  key: "ISSUED" | "OVERDUE" | "RETURNED" | "LOST_DAMAGED";
} {
  if (loan.returned_on) {
    if (loan.return_condition === "LOST")
      return { label: "Lost", tone: "danger", key: "LOST_DAMAGED" };
    if (loan.return_condition === "DAMAGED")
      return { label: "Returned damaged", tone: "warning", key: "LOST_DAMAGED" };
    return { label: "Returned", tone: "neutral", key: "RETURNED" };
  }
  const today = todayIso();
  if (loan.due_date && loan.due_date < today) {
    const late = daysBetween(loan.due_date, today);
    return { label: `Overdue ${late} day${late === 1 ? "" : "s"}`, tone: "danger", key: "OVERDUE" };
  }
  if (loan.due_date && daysBetween(today, loan.due_date) <= 2)
    return { label: "Due soon", tone: "warning", key: "ISSUED" };
  return { label: "Issued", tone: "info", key: "ISSUED" };
}

function useRefreshLibrary() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all(
      LIBRARY_QUERY_KEYS.map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
  };
}

/** Title-level availability, e.g. "2 of 3 available". */
function useAvailability(copies: ApiLibraryCopy[]) {
  return useMemo(() => {
    const map = new Map<string, { total: number; available: number; issued: number }>();
    for (const c of copies) {
      const entry = map.get(c.book_id) ?? { total: 0, available: 0, issued: 0 };
      if (c.status !== "WITHDRAWN" && c.status !== "LOST") entry.total += 1;
      if (c.status === "AVAILABLE") entry.available += 1;
      if (c.status === "ISSUED") entry.issued += 1;
      map.set(c.book_id, entry);
    }
    return map;
  }, [copies]);
}

function AvailabilityBadge({ info }: { info: { total: number; available: number } | undefined }) {
  if (!info || info.total === 0) return <StatusBadge status="Not available" tone="neutral" />;
  if (info.available === 0) return <StatusBadge status="All copies issued" tone="warning" />;
  return <StatusBadge status={`${info.available} of ${info.total} available`} tone="success" />;
}

export default function Page() {
  const { user } = useAuth();
  const isAdmin = user?.role === "SCHOOL_ADMIN";
  const manage = useHasPermission("library.manage", Boolean(user) && !isAdmin);
  if (!isAdmin && manage.isLoading) return <TableSkeleton rows={5} cols={4} />;
  return isAdmin || manage.data === true ? <LibrarianView /> : <ReaderView />;
}

// ============================================================================
// Students, teachers and staff: own loans + catalogue browsing
// ============================================================================

function ReaderView() {
  const { data: booksData, isLoading: booksLoading } = useLibraryBooks();
  const { data: copiesData } = useLibraryCopies();
  const { data: recordsData, isLoading } = useLibraryRecords();
  const books = useMemo(() => booksData ?? [], [booksData]);
  const booksById = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const availability = useAvailability(copiesData ?? []);
  const copiesById = useMemo(() => new Map((copiesData ?? []).map((c) => [c.id, c])), [copiesData]);

  // Only the signed-in borrower's own loans are returned by the backend.
  const loans = useMemo(
    () =>
      [...(recordsData ?? [])].sort(
        (a, b) =>
          (a.returned_on ? 1 : 0) - (b.returned_on ? 1 : 0) ||
          (b.issued_on ?? "").localeCompare(a.issued_on ?? ""),
      ),
    [recordsData],
  );
  const current = loans.filter((r) => !r.returned_on);
  const overdue = current.filter((r) => loanStatus(r).key === "OVERDUE");

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(1);
  const categories = useMemo(
    () => [...new Set(books.map((b) => b.category ?? "").filter(Boolean))].sort(),
    [books],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return books.filter(
      (b) =>
        (category === "all" || b.category === category) &&
        (!q ||
          [b.title, b.author, b.isbn, b.category].some((v) => (v ?? "").toLowerCase().includes(q))),
    );
  }, [books, search, category]);
  const { rows, pageCount } = usePaged(filtered, page, 10);

  return (
    <div>
      <PageHeader
        title="Library"
        description="Your borrowed books and the school library catalogue."
        breadcrumb={["Dashboard", "Library"]}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <InfoCard label="Currently Issued" value={current.length} icon={BookOpen} tone="navy" />
        <InfoCard
          label="Overdue"
          value={overdue.length}
          icon={AlertTriangle}
          tone={overdue.length ? "danger" : "success"}
        />
        <InfoCard label="Total History" value={loans.length} icon={Layers} tone="info" />
      </div>

      {overdue.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive-soft p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          You have {overdue.length} overdue book{overdue.length === 1 ? "" : "s"}. Please return{" "}
          {overdue.length === 1 ? "it" : "them"} to the library.
        </div>
      )}

      <Tabs defaultValue="mine">
        <TabsList className="mb-4">
          <TabsTrigger value="mine">My Books</TabsTrigger>
          <TabsTrigger value="catalogue">Browse Catalogue</TabsTrigger>
        </TabsList>
        <TabsContent value="mine">
          <div className="panel">
            {isLoading ? (
              <TableSkeleton rows={4} cols={4} />
            ) : loans.length === 0 ? (
              <EmptyState
                title="No books issued"
                description="Books issued to you will appear here."
                icon={BookOpen}
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Book</TableHead>
                      <TableHead>Issued On</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Returned On</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loans.map((r) => {
                      const s = loanStatus(r);
                      const copy = r.copy_id ? copiesById.get(r.copy_id) : undefined;
                      return (
                        <TableRow key={r.id}>
                          <TableCell>
                            <p className="font-medium">{booksById.get(r.book_id)?.title ?? "—"}</p>
                            {copy && (
                              <p className="text-xs text-muted-foreground">
                                Copy {copy.accession_no}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {fmtDate(r.issued_on)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{fmtDate(r.due_date)}</TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {fmtDate(r.returned_on)}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={s.label} tone={s.tone} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>
        <TabsContent value="catalogue">
          <SectionCard bodyClassName="p-0">
            <div className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row sm:flex-wrap sm:items-center">
              <SearchInput
                value={search}
                onChange={(v) => {
                  setSearch(v);
                  setPage(1);
                }}
                placeholder="Search title, author, ISBN…"
              />
              {categories.length > 0 && (
                <FilterSelect
                  value={category}
                  onChange={(v) => {
                    setCategory(v);
                    setPage(1);
                  }}
                  options={categories}
                  placeholder="All categories"
                />
              )}
            </div>
            {booksLoading ? (
              <TableSkeleton rows={5} cols={4} />
            ) : rows.length === 0 ? (
              <EmptyState
                title="No books found"
                description="Try a different search."
                icon={BookOpen}
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Shelf</TableHead>
                      <TableHead>Availability</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell>
                          <p className="font-medium">{b.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {[b.author, b.edition && `${b.edition} ed.`]
                              .filter(Boolean)
                              .join(" · ") || "Unknown author"}
                          </p>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{b.category ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {b.shelf_location ?? "—"}
                        </TableCell>
                        <TableCell>
                          <AvailabilityBadge info={availability.get(b.id)} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <Pager
              page={Math.min(page, pageCount)}
              pageCount={pageCount}
              onPage={setPage}
              total={filtered.length}
            />
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================================
// School Admin / Librarian
// ============================================================================

function LibrarianView() {
  const { data: booksData, isLoading: booksLoading } = useLibraryBooks();
  const { data: copiesData } = useLibraryCopies();
  const { data: loansData, isLoading: loansLoading } = useLibraryCirculation();
  const { data: settings } = useLibrarySettings();
  const books = useMemo(() => booksData ?? [], [booksData]);
  const copies = useMemo(() => copiesData ?? [], [copiesData]);
  const loans = useMemo(() => loansData ?? [], [loansData]);
  const [tab, setTab] = useState("catalogue");

  const count = (s: LibraryCopyStatus) => copies.filter((c) => c.status === s).length;
  const overdue = loans.filter((l) => !l.returned_on && l.overdue_days > 0).length;

  return (
    <div>
      <PageHeader
        title="Library Management"
        description="Catalogue, issue and return, overdue tracking and reports."
        breadcrumb={["Dashboard", "Library"]}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <InfoCard label="Titles" value={books.length} icon={LibraryIcon} tone="navy" />
        <InfoCard
          label="Copies"
          value={copies.filter((c) => c.status !== "WITHDRAWN").length}
          icon={BookCopy}
          tone="info"
        />
        <InfoCard label="Available" value={count("AVAILABLE")} icon={CheckCircle2} tone="success" />
        <InfoCard label="Issued" value={count("ISSUED")} icon={BookOpen} tone="gold" />
        <InfoCard
          label="Overdue"
          value={overdue}
          icon={AlertTriangle}
          tone={overdue ? "danger" : "success"}
        />
        <InfoCard
          label="Lost / Damaged"
          value={count("LOST") + count("DAMAGED")}
          icon={Layers}
          tone="warning"
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="mb-4 overflow-x-auto">
          <TabsList>
            <TabsTrigger value="catalogue">Catalogue</TabsTrigger>
            <TabsTrigger value="circulation">Issue & Return</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="catalogue">
          <CatalogueTab books={books} copies={copies} loans={loans} isLoading={booksLoading} />
        </TabsContent>
        <TabsContent value="circulation">
          <CirculationTab
            books={books}
            copies={copies}
            loans={loans}
            settings={settings}
            isLoading={loansLoading}
          />
        </TabsContent>
        <TabsContent value="reports">
          <ReportsTab loans={loans} isLoading={loansLoading} />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsTab settings={settings} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

function CatalogueTab({
  books,
  copies,
  loans,
  isLoading,
}: {
  books: ApiLibraryBook[];
  copies: ApiLibraryCopy[];
  loans: ApiLibraryLoan[];
  isLoading: boolean;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ApiLibraryBook | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  const availability = useAvailability(copies);
  const copiesByBook = useMemo(() => {
    const map = new Map<string, ApiLibraryCopy[]>();
    for (const c of copies) map.set(c.book_id, [...(map.get(c.book_id) ?? []), c]);
    return map;
  }, [copies]);
  const categories = useMemo(
    () => [...new Set(books.map((b) => b.category ?? "").filter(Boolean))].sort(),
    [books],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return books.filter((b) => {
      const info = availability.get(b.id);
      const matchesQ =
        !q ||
        [b.title, b.author, b.isbn, b.category, b.publisher].some((v) =>
          (v ?? "").toLowerCase().includes(q),
        ) ||
        (copiesByBook.get(b.id) ?? []).some(
          (c) =>
            c.accession_no.toLowerCase().includes(q) || (c.barcode ?? "").toLowerCase().includes(q),
        );
      const matchesAvailability =
        availabilityFilter === "all" ||
        (availabilityFilter === "Available"
          ? (info?.available ?? 0) > 0
          : (info?.available ?? 0) === 0);
      return matchesQ && (category === "all" || b.category === category) && matchesAvailability;
    });
  }, [books, search, category, availabilityFilter, availability, copiesByBook]);
  const { rows, pageCount } = usePaged(filtered, page, 10);
  const details = books.find((b) => b.id === detailsId) ?? null;

  return (
    <SectionCard
      title="Catalogue"
      subtitle={`${books.length} titles`}
      action={
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> Add Book
        </Button>
      }
      bodyClassName="p-0"
    >
      <div className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Title, author, ISBN, accession, barcode…"
        />
        {categories.length > 0 && (
          <FilterSelect
            value={category}
            onChange={(v) => {
              setCategory(v);
              setPage(1);
            }}
            options={categories}
            placeholder="All categories"
          />
        )}
        <FilterSelect
          value={availabilityFilter}
          onChange={(v) => {
            setAvailabilityFilter(v);
            setPage(1);
          }}
          options={["Available", "Not available"]}
          placeholder="Availability"
        />
      </div>
      {isLoading ? (
        <TableSkeleton rows={6} cols={5} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No books found"
          description="Add a book or change the search."
          icon={BookOpen}
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>ISBN</TableHead>
                <TableHead>Shelf</TableHead>
                <TableHead>Copies</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <p className="font-medium">{b.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {[b.author, b.edition && `${b.edition} ed.`, b.publisher]
                        .filter(Boolean)
                        .join(" · ") || "Unknown author"}
                    </p>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{b.category ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {b.isbn ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{b.shelf_location ?? "—"}</TableCell>
                  <TableCell>
                    <AvailabilityBadge info={availability.get(b.id)} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={() => setDetailsId(b.id)}
                    >
                      Details
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pager
        page={Math.min(page, pageCount)}
        pageCount={pageCount}
        onPage={setPage}
        total={filtered.length}
      />

      <BookFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing}
        categories={categories}
      />
      <BookDetailsDialog
        book={details}
        copies={details ? (copiesByBook.get(details.id) ?? []) : []}
        loans={loans}
        onClose={() => setDetailsId(null)}
        onEdit={(b) => {
          setEditing(b);
          setFormOpen(true);
        }}
      />
    </SectionCard>
  );
}

function BookFormDialog({
  open,
  onOpenChange,
  initial,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: ApiLibraryBook | null;
  categories: string[];
}) {
  const refresh = useRefreshLibrary();
  const [values, setValues] = useState({
    title: "",
    author: "",
    isbn: "",
    category: "",
    publisher: "",
    edition: "",
    shelfLocation: "",
    copies: "1",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValues({
      title: initial?.title ?? "",
      author: initial?.author ?? "",
      isbn: initial?.isbn ?? "",
      category: initial?.category ?? "",
      publisher: initial?.publisher ?? "",
      edition: initial?.edition ?? "",
      shelfLocation: initial?.shelf_location ?? "",
      copies: "1",
    });
  }, [open, initial]);

  const set = (key: keyof typeof values) => (e: ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!values.title.trim()) {
      toast.error("Enter the book title");
      return;
    }
    const isbnDigits = values.isbn.replace(/[\s-]/g, "").toUpperCase();
    if (isbnDigits && !/^([0-9]{9}[0-9X]|[0-9]{13})$/.test(isbnDigits)) {
      toast.error("ISBN must have 10 or 13 digits (hyphens allowed)");
      return;
    }
    const copies = Number(values.copies);
    if (!initial && !(Number.isInteger(copies) && copies >= 1 && copies <= 100)) {
      toast.error("Number of copies must be between 1 and 100");
      return;
    }
    setSaving(true);
    try {
      const details = {
        title: values.title.trim(),
        author: values.author.trim() || null,
        isbn: values.isbn.trim() || null,
        category: values.category.trim() || null,
        publisher: values.publisher.trim() || null,
        edition: values.edition.trim() || null,
      };
      if (initial) {
        await api.patch(`/library/books/${initial.id}`, {
          ...details,
          shelfLocation: values.shelfLocation.trim() || null,
        });
        toast.success("Book updated");
      } else {
        await api.post("/library/books", {
          ...details,
          shelfLocation: values.shelfLocation.trim() || null,
          copies,
        });
        toast.success(copies === 1 ? "Book added" : `Book added with ${copies} copies`);
      }
      await refresh();
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, "Could not save the book"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Book" : "Add Book"}</DialogTitle>
          <DialogDescription>
            {initial
              ? "Update the catalogue details."
              : "Each copy gets its own accession number automatically."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className="mb-1.5 text-xs">Title *</Label>
            <Input className="h-9" maxLength={200} value={values.title} onChange={set("title")} />
          </div>
          <div className="sm:col-span-2">
            <Label className="mb-1.5 text-xs">Author</Label>
            <Input className="h-9" maxLength={200} value={values.author} onChange={set("author")} />
          </div>
          <div>
            <Label className="mb-1.5 text-xs">ISBN</Label>
            <Input
              className="h-9"
              maxLength={20}
              placeholder="978-…"
              value={values.isbn}
              onChange={set("isbn")}
            />
          </div>
          <div>
            <Label className="mb-1.5 text-xs">Category</Label>
            <Input
              className="h-9"
              maxLength={80}
              list="library-categories"
              placeholder="e.g. Fiction"
              value={values.category}
              onChange={set("category")}
            />
            <datalist id="library-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <Label className="mb-1.5 text-xs">Publisher</Label>
            <Input
              className="h-9"
              maxLength={120}
              value={values.publisher}
              onChange={set("publisher")}
            />
          </div>
          <div>
            <Label className="mb-1.5 text-xs">Edition</Label>
            <Input
              className="h-9"
              maxLength={40}
              placeholder="e.g. 2nd"
              value={values.edition}
              onChange={set("edition")}
            />
          </div>
          <div>
            <Label className="mb-1.5 text-xs">Shelf / Location</Label>
            <Input
              className="h-9"
              maxLength={60}
              placeholder="e.g. Rack B-2"
              value={values.shelfLocation}
              onChange={set("shelfLocation")}
            />
          </div>
          {!initial && (
            <div>
              <Label className="mb-1.5 text-xs">Number of Copies *</Label>
              <Input
                className="h-9"
                type="number"
                min={1}
                max={100}
                value={values.copies}
                onChange={set("copies")}
              />
            </div>
          )}
          <DialogFooter className="gap-2 sm:col-span-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save Book"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BookDetailsDialog({
  book,
  copies,
  loans,
  onClose,
  onEdit,
}: {
  book: ApiLibraryBook | null;
  copies: ApiLibraryCopy[];
  loans: ApiLibraryLoan[];
  onClose: () => void;
  onEdit: (book: ApiLibraryBook) => void;
}) {
  const refresh = useRefreshLibrary();
  const [addCount, setAddCount] = useState("1");
  const [editingCopy, setEditingCopy] = useState<ApiLibraryCopy | null>(null);
  const [busy, setBusy] = useState(false);
  const openLoanByCopy = useMemo(
    () => new Map(loans.filter((l) => !l.returned_on && l.copy_id).map((l) => [l.copy_id!, l])),
    [loans],
  );
  const hasHistory = book ? loans.some((l) => l.book_id === book.id) : false;
  const sortedCopies = [...copies].sort((a, b) =>
    a.accession_no.localeCompare(b.accession_no, undefined, { numeric: true }),
  );

  async function addCopies() {
    if (!book) return;
    const n = Number(addCount);
    if (!(Number.isInteger(n) && n >= 1 && n <= 100)) {
      toast.error("Enter between 1 and 100 copies");
      return;
    }
    setBusy(true);
    try {
      await api.post(`/library/books/${book.id}/copies`, { count: n });
      await refresh();
      toast.success(`${n} cop${n === 1 ? "y" : "ies"} added`);
      setAddCount("1");
    } catch (err) {
      toast.error(errorMessage(err, "Could not add copies"));
    } finally {
      setBusy(false);
    }
  }

  async function removeBook() {
    if (!book || !confirm(`Delete "${book.title}" and its copies? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await api.delete(`/library/books/${book.id}`);
      await refresh();
      toast.success("Book deleted");
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, "Could not delete the book"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={book !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        {book && (
          <>
            <DialogHeader>
              <DialogTitle>{book.title}</DialogTitle>
              <DialogDescription>by {book.author ?? "Unknown author"}</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/40 p-3 text-sm sm:grid-cols-3">
              {[
                ["ISBN", book.isbn],
                ["Category", book.category],
                ["Publisher", book.publisher],
                ["Edition", book.edition],
                ["Shelf", book.shelf_location],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="font-medium">{value || "—"}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  onClose();
                  onEdit(book);
                }}
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit details
              </Button>
              {!hasHistory && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  onClick={removeBook}
                  disabled={busy}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete book
                </Button>
              )}
            </div>

            <div>
              <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                <p className="text-sm font-semibold">Copies ({copies.length})</p>
                <div className="flex items-end gap-2">
                  <Input
                    className="h-8 w-20"
                    type="number"
                    min={1}
                    max={100}
                    value={addCount}
                    onChange={(e) => setAddCount(e.target.value)}
                    aria-label="Copies to add"
                  />
                  <Button size="sm" className="h-8" onClick={addCopies} disabled={busy}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add copies
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto rounded-xl border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Accession</TableHead>
                      <TableHead>Barcode</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>With</TableHead>
                      <TableHead className="text-right">Edit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedCopies.map((c) => {
                      const loan = openLoanByCopy.get(c.id);
                      return (
                        <TableRow key={c.id}>
                          <TableCell className="whitespace-nowrap font-medium">
                            {c.accession_no}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {c.barcode ?? "—"}
                          </TableCell>
                          <TableCell>
                            <StatusBadge
                              status={COPY_STATUS[c.status].label}
                              tone={COPY_STATUS[c.status].tone}
                            />
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {loan
                              ? `${loan.borrower_name ?? "—"} · due ${fmtDate(loan.due_date)}`
                              : (c.note ?? "—")}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              aria-label={`Edit copy ${c.accession_no}`}
                              onClick={() => setEditingCopy(c)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        )}
        <CopyEditDialog copy={editingCopy} onClose={() => setEditingCopy(null)} />
      </DialogContent>
    </Dialog>
  );
}

function CopyEditDialog({ copy, onClose }: { copy: ApiLibraryCopy | null; onClose: () => void }) {
  const refresh = useRefreshLibrary();
  const [accession, setAccession] = useState("");
  const [barcode, setBarcode] = useState("");
  const [status, setStatus] = useState<LibraryCopyStatus>("AVAILABLE");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!copy) return;
    setAccession(copy.accession_no);
    setBarcode(copy.barcode ?? "");
    setStatus(copy.status);
    setNote(copy.note ?? "");
  }, [copy]);

  async function save() {
    if (!copy) return;
    if (!accession.trim()) {
      toast.error("Accession number is required");
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/library/copies/${copy.id}`, {
        accessionNo: accession.trim(),
        barcode: barcode.trim() || null,
        note: note.trim() || null,
        ...(copy.status === "ISSUED" ? {} : { status }),
      });
      await refresh();
      toast.success("Copy updated");
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, "Could not update the copy"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={copy !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Copy {copy?.accession_no}</DialogTitle>
          <DialogDescription>
            {copy?.status === "ISSUED"
              ? "This copy is issued. Mark it lost or damaged when it is returned."
              : "Change the barcode, or mark the copy damaged, lost or withdrawn."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 text-xs">Accession No. *</Label>
              <Input
                className="h-9"
                maxLength={40}
                value={accession}
                onChange={(e) => setAccession(e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1.5 text-xs">Barcode</Label>
              <Input
                className="h-9"
                maxLength={60}
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label className="mb-1.5 text-xs">Status</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as LibraryCopyStatus)}
              disabled={copy?.status === "ISSUED"}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(copy?.status === "ISSUED"
                  ? (["ISSUED"] as LibraryCopyStatus[])
                  : (["AVAILABLE", "DAMAGED", "LOST", "WITHDRAWN"] as LibraryCopyStatus[])
                ).map((s) => (
                  <SelectItem key={s} value={s}>
                    {COPY_STATUS[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5 text-xs">Note</Label>
            <Textarea
              rows={2}
              maxLength={300}
              placeholder="Optional, e.g. spine repaired"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Issue & return
// ---------------------------------------------------------------------------

function useDebounced(value: string, ms = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function loanDays(settings: ApiLibrarySettings | undefined, type: LibraryBorrowerType) {
  if (!settings) return type === "STUDENT" ? 14 : 30;
  return type === "STUDENT"
    ? settings.student_loan_days
    : type === "TEACHER"
      ? settings.teacher_loan_days
      : settings.staff_loan_days;
}
function borrowLimit(settings: ApiLibrarySettings | undefined, type: LibraryBorrowerType) {
  if (!settings) return type === "STUDENT" ? 2 : 5;
  return type === "STUDENT"
    ? settings.student_max_books
    : type === "TEACHER"
      ? settings.teacher_max_books
      : settings.staff_max_books;
}

function CirculationTab({
  books,
  copies,
  loans,
  settings,
  isLoading,
}: {
  books: ApiLibraryBook[];
  copies: ApiLibraryCopy[];
  loans: ApiLibraryLoan[];
  settings: ApiLibrarySettings | undefined;
  isLoading: boolean;
}) {
  const refresh = useRefreshLibrary();
  const booksById = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);

  // Borrower
  const [borrowerType, setBorrowerType] = useState<LibraryBorrowerType>("STUDENT");
  const [borrowerQuery, setBorrowerQuery] = useState("");
  const debouncedBorrower = useDebounced(borrowerQuery);
  const { data: borrowerResults, isFetching: searchingBorrowers } = useLibraryBorrowers(
    debouncedBorrower,
    borrowerType,
    debouncedBorrower.trim().length >= 2,
  );
  const [borrower, setBorrower] = useState<ApiLibraryBorrower | null>(null);
  // Copy
  const [copyQuery, setCopyQuery] = useState("");
  const [copyId, setCopyId] = useState("");
  const [dueDate, setDueDate] = useState(addDays(14));
  const [issuing, setIssuing] = useState(false);

  useEffect(() => {
    setDueDate(addDays(loanDays(settings, borrower?.borrower_type ?? borrowerType)));
  }, [settings, borrower, borrowerType]);

  const borrowerLoans = borrower
    ? loans.filter((l) => !l.returned_on && l.borrower_id === borrower.id)
    : [];
  const borrowerOverdue = borrowerLoans.filter((l) => l.overdue_days > 0).length;
  const limit = borrower ? borrowLimit(settings, borrower.borrower_type) : 0;

  const availableCopies = useMemo(() => {
    const q = copyQuery.trim().toLowerCase();
    if (!q) return [];
    return copies
      .filter((c) => c.status === "AVAILABLE")
      .filter((c) => {
        const b = booksById.get(c.book_id);
        return (
          c.accession_no.toLowerCase().includes(q) ||
          (c.barcode ?? "").toLowerCase().includes(q) ||
          (b?.title ?? "").toLowerCase().includes(q) ||
          (b?.isbn ?? "").toLowerCase().includes(q)
        );
      })
      .slice(0, 20);
  }, [copies, copyQuery, booksById]);
  const selectedCopy = copies.find((c) => c.id === copyId);

  // A scanner typically types the full barcode then Enter: pick the exact match.
  function onCopyKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const q = copyQuery.trim().toLowerCase();
    const exact = copies.find(
      (c) => c.accession_no.toLowerCase() === q || (c.barcode ?? "").toLowerCase() === q,
    );
    if (!exact) return;
    if (exact.status !== "AVAILABLE")
      toast.error(`Copy ${exact.accession_no} is ${COPY_STATUS[exact.status].label.toLowerCase()}`);
    else setCopyId(exact.id);
  }

  async function issue() {
    if (!borrower || !selectedCopy) return;
    if (dueDate < todayIso()) {
      toast.error("Due date cannot be in the past");
      return;
    }
    setIssuing(true);
    try {
      await api.post("/library/records", {
        copyId: selectedCopy.id,
        borrowerType: borrower.borrower_type,
        borrowerId: borrower.id,
        dueDate,
      });
      await refresh();
      toast.success(`Issued to ${borrower.name}, due ${fmtDate(dueDate)}`);
      setCopyId("");
      setCopyQuery("");
    } catch (err) {
      toast.error(errorMessage(err, "Could not issue the book"));
    } finally {
      setIssuing(false);
    }
  }

  // Current loans
  const [search, setSearch] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [returning, setReturning] = useState<ApiLibraryLoan | null>(null);
  const open = useMemo(() => {
    const q = search.trim().toLowerCase();
    return loans
      .filter((l) => !l.returned_on)
      .filter((l) => !overdueOnly || l.overdue_days > 0)
      .filter(
        (l) =>
          !q ||
          [l.title, l.accession_no, l.barcode, l.borrower_name, l.borrower_number, l.isbn].some(
            (v) => (v ?? "").toLowerCase().includes(q),
          ),
      )
      .sort(
        (a, b) =>
          b.overdue_days - a.overdue_days || (a.due_date ?? "").localeCompare(b.due_date ?? ""),
      );
  }, [loans, search, overdueOnly]);
  const { rows, pageCount } = usePaged(open, page, 10);

  async function renew(loan: ApiLibraryLoan) {
    try {
      const res = await api.post<{ dueDate: string }>(`/library/records/${loan.id}/renew`, {});
      await refresh();
      toast.success(`Renewed until ${fmtDate(res.dueDate)}`);
    } catch (err) {
      toast.error(errorMessage(err, "Could not renew"));
    }
  }

  return (
    <div className="grid gap-4">
      <SectionCard
        title="Issue a Book"
        subtitle="Find the borrower, pick an available copy, confirm the due date"
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="grid gap-2">
            <Label className="text-xs">1. Borrower</Label>
            {borrower ? (
              <div className="rounded-xl border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{borrower.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {BORROWER_LABEL[borrower.borrower_type]}
                      {borrower.number ? ` · ${borrower.number}` : ""}
                      {borrower.detail ? ` · ${borrower.detail}` : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    onClick={() => setBorrower(null)}
                  >
                    Change
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <StatusBadge
                    status={`${borrowerLoans.length} of ${limit} books issued`}
                    tone={borrowerLoans.length >= limit ? "danger" : "info"}
                  />
                  {borrowerOverdue > 0 && (
                    <StatusBadge status={`${borrowerOverdue} overdue`} tone="danger" />
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <Select
                    value={borrowerType}
                    onValueChange={(v) => setBorrowerType(v as LibraryBorrowerType)}
                  >
                    <SelectTrigger className="h-9 w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(BORROWER_LABEL) as LibraryBorrowerType[]).map((t) => (
                        <SelectItem key={t} value={t}>
                          {BORROWER_LABEL[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="h-9"
                    placeholder={
                      borrowerType === "STUDENT" ? "Name or admission no." : "Name or employee ID"
                    }
                    value={borrowerQuery}
                    onChange={(e) => setBorrowerQuery(e.target.value)}
                  />
                </div>
                {debouncedBorrower.trim().length >= 2 && (
                  <div className="max-h-52 overflow-y-auto rounded-xl border border-border">
                    {searchingBorrowers && !borrowerResults ? (
                      <p className="p-3 text-xs text-muted-foreground">Searching…</p>
                    ) : (borrowerResults ?? []).length === 0 ? (
                      <p className="p-3 text-xs text-muted-foreground">
                        No active {BORROWER_LABEL[borrowerType].toLowerCase()} found.
                      </p>
                    ) : (
                      (borrowerResults ?? []).map((b) => (
                        <button
                          key={`${b.borrower_type}-${b.id}`}
                          type="button"
                          className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-sm last:border-0 hover:bg-muted/50"
                          onClick={() => {
                            setBorrower(b);
                            setBorrowerQuery("");
                          }}
                        >
                          <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{b.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {[b.number, b.detail].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="grid gap-2">
            <Label className="text-xs">2. Copy</Label>
            {selectedCopy ? (
              <div className="flex items-start justify-between gap-2 rounded-xl border border-border p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {booksById.get(selectedCopy.book_id)?.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Copy {selectedCopy.accession_no}
                    {selectedCopy.barcode ? ` · ${selectedCopy.barcode}` : ""}
                  </p>
                </div>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => setCopyId("")}>
                  Change
                </Button>
              </div>
            ) : (
              <>
                <Input
                  className="h-9"
                  placeholder="Scan barcode, or type accession no. / title / ISBN"
                  value={copyQuery}
                  onChange={(e) => setCopyQuery(e.target.value)}
                  onKeyDown={onCopyKey}
                />
                {copyQuery.trim() && (
                  <div className="max-h-52 overflow-y-auto rounded-xl border border-border">
                    {availableCopies.length === 0 ? (
                      <p className="p-3 text-xs text-muted-foreground">
                        No available copy matches.
                      </p>
                    ) : (
                      availableCopies.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="flex w-full items-center justify-between gap-2 border-b border-border px-3 py-2 text-left text-sm last:border-0 hover:bg-muted/50"
                          onClick={() => setCopyId(c.id)}
                        >
                          <span className="min-w-0 truncate font-medium">
                            {booksById.get(c.book_id)?.title}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {c.accession_no}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
            <div className="grid grid-cols-[1fr_auto] items-end gap-2">
              <div>
                <Label className="mb-1.5 text-xs">3. Due Date</Label>
                <Input
                  className="h-9"
                  type="date"
                  min={todayIso()}
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
              <Button
                className="h-9"
                onClick={issue}
                disabled={!borrower || !selectedCopy || issuing}
              >
                <BookOpen className="mr-1.5 h-4 w-4" /> {issuing ? "Issuing…" : "Issue Book"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Default loan: {loanDays(settings, borrower?.borrower_type ?? borrowerType)} days for{" "}
              {BORROWER_LABEL[borrower?.borrower_type ?? borrowerType].toLowerCase()}s.
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Currently Issued"
        subtitle={`${loans.filter((l) => !l.returned_on).length} books out`}
        bodyClassName="p-0"
      >
        <div className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row sm:flex-wrap sm:items-center">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Book, accession, borrower name or number…"
          />
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={overdueOnly}
              onCheckedChange={(v) => {
                setOverdueOnly(v);
                setPage(1);
              }}
            />{" "}
            Overdue only
          </label>
        </div>
        {isLoading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : rows.length === 0 ? (
          <EmptyState title={overdueOnly ? "No overdue books" : "No books issued"} icon={Layers} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Book</TableHead>
                  <TableHead>Borrower</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((l) => {
                  const s = loanStatus(l);
                  return (
                    <TableRow key={l.id}>
                      <TableCell>
                        <p className="font-medium">{l.title}</p>
                        <p className="text-xs text-muted-foreground">
                          Copy {l.accession_no ?? "—"}
                        </p>
                      </TableCell>
                      <TableCell>
                        <p className="whitespace-nowrap">{l.borrower_name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">
                          {BORROWER_LABEL[l.borrower_type]}
                          {l.borrower_number ? ` · ${l.borrower_number}` : ""}
                          {l.borrower_detail ? ` · ${l.borrower_detail}` : ""}
                        </p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {fmtDate(l.issued_on)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {fmtDate(l.due_date)}
                        {l.renew_count > 0 && (
                          <p className="text-[11px] text-muted-foreground">
                            Renewed {l.renew_count}×
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={s.label} tone={s.tone} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => renew(l)}
                            disabled={
                              l.overdue_days > 0 ||
                              (settings ? l.renew_count >= settings.max_renewals : false)
                            }
                          >
                            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Renew
                          </Button>
                          <Button size="sm" className="h-8" onClick={() => setReturning(l)}>
                            <Undo2 className="mr-1 h-3.5 w-3.5" /> Return
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
        <Pager
          page={Math.min(page, pageCount)}
          pageCount={pageCount}
          onPage={setPage}
          total={open.length}
        />
      </SectionCard>

      <ReturnDialog loan={returning} onClose={() => setReturning(null)} />
    </div>
  );
}

function ReturnDialog({ loan, onClose }: { loan: ApiLibraryLoan | null; onClose: () => void }) {
  const refresh = useRefreshLibrary();
  const [condition, setCondition] = useState<keyof typeof CONDITION_LABEL>("GOOD");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loan) {
      setCondition("GOOD");
      setRemarks("");
    }
  }, [loan]);

  async function submit() {
    if (!loan) return;
    setSaving(true);
    try {
      await api.patch(`/library/records/${loan.id}/return`, {
        condition,
        remarks: remarks.trim() || null,
      });
      await refresh();
      toast.success(
        condition === "GOOD"
          ? "Book returned"
          : `Book returned as ${CONDITION_LABEL[condition].toLowerCase()}`,
      );
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, "Could not return the book"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={loan !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Return Book</DialogTitle>
          <DialogDescription>
            {loan?.title} (copy {loan?.accession_no}) from {loan?.borrower_name}.
            {loan && loan.overdue_days > 0
              ? ` Overdue by ${loan.overdue_days} day${loan.overdue_days === 1 ? "" : "s"}.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label className="mb-1.5 text-xs">Condition</Label>
            <Select
              value={condition}
              onValueChange={(v) => setCondition(v as keyof typeof CONDITION_LABEL)}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GOOD">Good — back on the shelf</SelectItem>
                <SelectItem value="DAMAGED">Damaged — keep aside</SelectItem>
                <SelectItem value="LOST">Lost — not returned</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5 text-xs">Remarks</Label>
            <Textarea
              rows={2}
              maxLength={300}
              placeholder="Optional"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Confirm Return"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

const REPORT_STATUSES = ["Issued", "Overdue", "Returned", "Lost / Damaged"];
const REPORT_KEY: Record<string, string> = {
  Issued: "ISSUED",
  Overdue: "OVERDUE",
  Returned: "RETURNED",
  "Lost / Damaged": "LOST_DAMAGED",
};

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function ReportsTab({ loans, isLoading }: { loans: ApiLibraryLoan[]; isLoading: boolean }) {
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return loans.filter((l) => {
      const s = loanStatus(l);
      // "Issued" includes overdue loans; "Overdue" narrows to them.
      const matchesStatus =
        status === "all" || (status === "Issued" ? !l.returned_on : s.key === REPORT_KEY[status]);
      return (
        matchesStatus &&
        (type === "all" || BORROWER_LABEL[l.borrower_type] === type) &&
        (!from || l.issued_on >= from) &&
        (!to || l.issued_on <= to) &&
        (!q ||
          [
            l.title,
            l.author,
            l.isbn,
            l.accession_no,
            l.barcode,
            l.borrower_name,
            l.borrower_number,
          ].some((v) => (v ?? "").toLowerCase().includes(q)))
      );
    });
  }, [loans, status, type, from, to, search]);
  const { rows, pageCount } = usePaged(filtered, page, 15);

  function exportCsv() {
    const header = [
      "Book",
      "Author",
      "ISBN",
      "Accession",
      "Borrower",
      "Type",
      "Number",
      "Class/Designation",
      "Issued",
      "Due",
      "Returned",
      "Status",
      "Renewals",
      "Remarks",
    ];
    const lines = filtered.map((l) =>
      [
        l.title,
        l.author,
        l.isbn,
        l.accession_no,
        l.borrower_name,
        BORROWER_LABEL[l.borrower_type],
        l.borrower_number,
        l.borrower_detail,
        fmtDate(l.issued_on),
        fmtDate(l.due_date),
        fmtDate(l.returned_on),
        loanStatus(l).label,
        l.renew_count,
        l.remarks,
      ]
        .map(csvCell)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `library-report-${todayIso()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <SectionCard
      title="Loan History & Reports"
      subtitle={`${filtered.length} of ${loans.length} records`}
      action={
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={exportCsv}
          disabled={filtered.length === 0}
        >
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      }
      bodyClassName="p-0"
    >
      <div className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Book, accession, borrower name or number…"
        />
        <FilterSelect
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={REPORT_STATUSES}
          placeholder="All statuses"
        />
        <FilterSelect
          value={type}
          onChange={(v) => {
            setType(v);
            setPage(1);
          }}
          options={Object.values(BORROWER_LABEL)}
          placeholder="All borrowers"
        />
        <div className="flex items-end gap-2">
          <div>
            <Label className="mb-1 text-[11px] text-muted-foreground">Issued from</Label>
            <Input
              className="h-9 w-[150px]"
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div>
            <Label className="mb-1 text-[11px] text-muted-foreground">to</Label>
            <Input
              className="h-9 w-[150px]"
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
      </div>
      {isLoading ? (
        <TableSkeleton rows={6} cols={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No records match"
          description="Change the filters to see more."
          icon={Layers}
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Book</TableHead>
                <TableHead>Borrower</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Returned</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((l) => {
                const s = loanStatus(l);
                return (
                  <TableRow key={l.id}>
                    <TableCell>
                      <p className="font-medium">{l.title}</p>
                      <p className="text-xs text-muted-foreground">Copy {l.accession_no ?? "—"}</p>
                    </TableCell>
                    <TableCell>
                      <p className="whitespace-nowrap">{l.borrower_name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        {BORROWER_LABEL[l.borrower_type]}
                        {l.borrower_number ? ` · ${l.borrower_number}` : ""}
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {fmtDate(l.issued_on)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {fmtDate(l.due_date)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {fmtDate(l.returned_on)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={s.label} tone={s.tone} />
                      {l.remarks && (
                        <p
                          className="mt-1 max-w-48 truncate text-[11px] text-muted-foreground"
                          title={l.remarks}
                        >
                          {l.remarks}
                        </p>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <Pager
        page={Math.min(page, pageCount)}
        pageCount={pageCount}
        onPage={setPage}
        total={filtered.length}
      />
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const SETTING_FIELDS: {
  key: keyof ApiLibrarySettings;
  body: string;
  label: string;
  min: number;
  max: number;
}[] = [
  {
    key: "student_loan_days",
    body: "studentLoanDays",
    label: "Student loan (days)",
    min: 1,
    max: 365,
  },
  {
    key: "teacher_loan_days",
    body: "teacherLoanDays",
    label: "Teacher loan (days)",
    min: 1,
    max: 365,
  },
  { key: "staff_loan_days", body: "staffLoanDays", label: "Staff loan (days)", min: 1, max: 365 },
  {
    key: "student_max_books",
    body: "studentMaxBooks",
    label: "Books per student",
    min: 0,
    max: 50,
  },
  {
    key: "teacher_max_books",
    body: "teacherMaxBooks",
    label: "Books per teacher",
    min: 0,
    max: 50,
  },
  {
    key: "staff_max_books",
    body: "staffMaxBooks",
    label: "Books per staff member",
    min: 0,
    max: 50,
  },
  { key: "max_renewals", body: "maxRenewals", label: "Renewals allowed per loan", min: 0, max: 10 },
];

function SettingsTab({ settings }: { settings: ApiLibrarySettings | undefined }) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const [blockOverdue, setBlockOverdue] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setValues(Object.fromEntries(SETTING_FIELDS.map((f) => [f.body, String(settings[f.key])])));
    setBlockOverdue(settings.block_when_overdue);
  }, [settings]);

  async function save() {
    const body: Record<string, number | boolean> = { blockWhenOverdue: blockOverdue };
    for (const f of SETTING_FIELDS) {
      const n = Number(values[f.body]);
      if (!Number.isInteger(n) || n < f.min || n > f.max) {
        toast.error(`${f.label} must be a whole number from ${f.min} to ${f.max}`);
        return;
      }
      body[f.body] = n;
    }
    setSaving(true);
    try {
      await api.put("/library/settings", body);
      await queryClient.invalidateQueries({ queryKey: ["library-settings"] });
      toast.success("Library settings saved");
    } catch (err) {
      toast.error(errorMessage(err, "Could not save settings"));
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return <TableSkeleton rows={3} cols={3} />;

  return (
    <SectionCard title="Borrowing Rules" subtitle="Applied when books are issued or renewed">
      <div className="grid gap-3 sm:grid-cols-3">
        {SETTING_FIELDS.map((f) => (
          <div key={f.body}>
            <Label className="mb-1.5 text-xs">{f.label}</Label>
            <Input
              className="h-9"
              type="number"
              min={f.min}
              max={f.max}
              value={values[f.body] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.body]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm">
        <Switch checked={blockOverdue} onCheckedChange={setBlockOverdue} />
        Don't issue new books to someone who has an overdue book
      </label>
      <div className="mt-4 flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save Settings"}
        </Button>
      </div>
    </SectionCard>
  );
}
