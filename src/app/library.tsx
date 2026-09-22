"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, CheckCircle2, Layers, Grid3x3, List, Plus } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { useLibraryBooks, useLibraryRecords, useStudents, type ApiLibraryBook } from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";


function initialsOf(title: string) {
  return title
    .split(" ")
    .filter((w) => w.length > 0)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

export default function Page() {
  const { user } = useAuth();
  if (user?.role === "STUDENT") return <StudentLibraryView />;
  return <AdminLibraryView />;
}

function StudentLibraryView() {
  const { data: books } = useLibraryBooks();
  const { data: records, isLoading } = useLibraryRecords();

  const booksById = new Map((books ?? []).map((b) => [b.id, b]));
  const rows = records ?? [];
  const issued = rows.filter((r) => !r.returned_on).length;

  return (
    <div>
      <PageHeader title="Library" description="Your issued books and history." breadcrumb={["Dashboard", "Library"]} />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <InfoCard label="Currently Issued" value={issued} icon={BookOpen} tone="navy" />
        <InfoCard label="Total History" value={rows.length} icon={Layers} tone="info" />
      </div>

      <div className="panel">
        {isLoading ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState title="No books issued" description="Books issued to you will appear here." icon={BookOpen} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Book</TableHead>
                  <TableHead>Issued On</TableHead>
                  <TableHead>Return Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{booksById.get(r.book_id)?.title ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.issued_on ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={r.returned_on ? "Returned" : "Issued"} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

function AdminLibraryView() {
  const { data: booksData, isLoading: booksLoading } = useLibraryBooks();
  const { data: recordsData, isLoading: recordsLoading } = useLibraryRecords();
  const { data: studentsData } = useStudents();
  const queryClient = useQueryClient();

  const books = booksData ?? [];
  const records = recordsData ?? [];
  const students = studentsData ?? [];
  const studentsById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const activeRecordByBook = useMemo(() => {
    const map = new Map<string, (typeof records)[number]>();
    for (const r of records) if (!r.returned_on) map.set(r.book_id, r);
    return map;
  }, [records]);

  const [search, setSearch] = useState("");
  const [availability, setAvailability] = useState("all");
  const [view, setView] = useState<"grid" | "table">("grid");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ApiLibraryBook | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState<ApiLibraryBook | null>(null);
  const [issueStudentId, setIssueStudentId] = useState("");
  const [addTitle, setAddTitle] = useState("");
  const [addAuthor, setAddAuthor] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    return books.filter((b) => {
      const matchesSearch =
        b.title.toLowerCase().includes(search.toLowerCase()) ||
        (b.author ?? "").toLowerCase().includes(search.toLowerCase());
      const matchesAvailability = availability === "all" || b.status === availability;
      return matchesSearch && matchesAvailability;
    });
  }, [books, search, availability]);

  const { rows, pageCount } = usePaged(filtered, page, 8);

  const totalBooks = books.length;
  const availableBooks = books.filter((b) => b.status === "Available").length;
  const issuedBooks = books.filter((b) => b.status === "Issued").length;

  const issuedRows = books.filter((b) => b.status === "Issued");

  async function handleAddBook() {
    if (!addTitle.trim()) return;
    setSaving(true);
    try {
      await api.post("/library/books", { title: addTitle.trim(), author: addAuthor.trim() || undefined });
      toast.success("Book added to catalogue");
      queryClient.invalidateQueries({ queryKey: ["library-books"] });
      setAddOpen(false);
      setAddTitle("");
      setAddAuthor("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to add book");
    } finally {
      setSaving(false);
    }
  }

  async function handleIssue(book: ApiLibraryBook) {
    if (!issueStudentId) return;
    setSaving(true);
    try {
      await api.post("/library/records", { bookId: book.id, studentId: issueStudentId });
      toast.success(`"${book.title}" issued successfully`);
      queryClient.invalidateQueries({ queryKey: ["library-books"] });
      queryClient.invalidateQueries({ queryKey: ["library-records"] });
      setIssueOpen(null);
      setIssueStudentId("");
      setSelected(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to issue book");
    } finally {
      setSaving(false);
    }
  }

  async function handleReturn(book: ApiLibraryBook) {
    const record = activeRecordByBook.get(book.id);
    if (!record) return;
    setSaving(true);
    try {
      await api.patch(`/library/records/${record.id}/return`);
      toast.success(`"${book.title}" marked as returned`);
      queryClient.invalidateQueries({ queryKey: ["library-books"] });
      queryClient.invalidateQueries({ queryKey: ["library-records"] });
      setSelected(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to return book");
    } finally {
      setSaving(false);
    }
  }

  const isLoading = booksLoading || recordsLoading;

  return (
    <div>
      <PageHeader
        title="Library Management"
        description="Track the school library catalogue, issued books and availability."
        breadcrumb={["Dashboard", "Library"]}
        actions={
          <Button size="sm" className="h-9" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Add Book
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <InfoCard label="Total Books" value={totalBooks} icon={BookOpen} tone="navy" />
        <InfoCard label="Available Books" value={availableBooks} icon={CheckCircle2} tone="success" />
        <InfoCard label="Issued Books" value={issuedBooks} icon={Layers} tone="gold" />
      </div>

      <SectionCard className="mt-4" title="Catalogue" subtitle="Search and filter the library collection">
        <div className="mb-4 grid gap-2 sm:flex sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row">
            <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search title, author…" />
            <FilterSelect value={availability} onChange={(v) => { setAvailability(v); setPage(1); }} options={["Available", "Issued"]} placeholder="Availability" />
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
            <button
              onClick={() => setView("grid")}
              className={`grid h-8 w-8 place-items-center rounded-md ${view === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              <Grid3x3 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView("table")}
              className={`grid h-8 w-8 place-items-center rounded-md ${view === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        {isLoading ? (
          <TableSkeleton rows={5} cols={4} />
        ) : rows.length === 0 ? (
          <EmptyState title="No books found" description="Try adjusting your search or filters." icon={BookOpen} />
        ) : view === "grid" ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {rows.map((b) => (
              <div key={b.id} className="panel flex flex-col gap-2 p-3">
                <div className="grid h-24 w-full place-items-center rounded-xl bg-primary/10 font-display text-2xl font-bold text-primary">
                  {initialsOf(b.title)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{b.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{b.author ?? "—"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={b.status} />
                </div>
                <div className="mt-1 flex gap-2">
                  <Button variant="outline" size="sm" className="h-8 flex-1" onClick={() => setSelected(b)}>
                    Details
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 flex-1"
                    disabled={b.status !== "Available"}
                    onClick={() => setIssueOpen(b)}
                  >
                    Issue
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-2 py-2">Title</th>
                  <th className="px-2 py-2">Author</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id} className="border-b border-border/60">
                    <td className="px-2 py-2 font-medium">{b.title}</td>
                    <td className="px-2 py-2 text-muted-foreground">{b.author ?? "—"}</td>
                    <td className="px-2 py-2"><StatusBadge status={b.status} /></td>
                    <td className="px-2 py-2">
                      <Button variant="outline" size="sm" className="h-7" onClick={() => setSelected(b)}>
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} pageCount={pageCount} onPage={setPage} total={filtered.length} />
      </SectionCard>

      <SectionCard className="mt-4" title="Issued Books" subtitle="Books currently checked out">
        {issuedRows.length === 0 ? (
          <EmptyState title="No issued books" icon={Layers} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-2 py-2">Issued To</th>
                  <th className="px-2 py-2">Book</th>
                  <th className="px-2 py-2">Issued On</th>
                  <th className="px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {issuedRows.map((b) => {
                  const record = activeRecordByBook.get(b.id);
                  const student = record ? studentsById.get(record.student_id) : undefined;
                  return (
                    <tr key={b.id} className="border-b border-border/60">
                      <td className="px-2 py-2 font-medium">{student?.name ?? "—"}</td>
                      <td className="px-2 py-2">{b.title}</td>
                      <td className="px-2 py-2 text-muted-foreground">{record?.issued_on ?? "—"}</td>
                      <td className="px-2 py-2"><StatusBadge status="Issued" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.title}</DialogTitle>
                <DialogDescription>by {selected.author ?? "Unknown"}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="grid h-28 w-full place-items-center rounded-xl bg-primary/10 font-display text-3xl font-bold text-primary">
                  {initialsOf(selected.title)}
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <StatusBadge status={selected.status} />
                  </div>
                  {selected.status === "Issued" && (() => {
                    const record = activeRecordByBook.get(selected.id);
                    const student = record ? studentsById.get(record.student_id) : undefined;
                    return (
                      <>
                        <div><p className="text-xs text-muted-foreground">Issued To</p><p>{student?.name ?? "—"}</p></div>
                        <div><p className="text-xs text-muted-foreground">Issued On</p><p>{record?.issued_on ?? "—"}</p></div>
                      </>
                    );
                  })()}
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  disabled={selected.status !== "Issued" || saving}
                  onClick={() => handleReturn(selected)}
                >
                  Return
                </Button>
                <Button
                  disabled={selected.status !== "Available" || saving}
                  onClick={() => setIssueOpen(selected)}
                >
                  Issue
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!issueOpen} onOpenChange={(o) => { if (!o) { setIssueOpen(null); setIssueStudentId(""); } }}>
        <DialogContent className="max-w-md">
          {issueOpen && (
            <>
              <DialogHeader>
                <DialogTitle>Issue "{issueOpen.title}"</DialogTitle>
                <DialogDescription>Select the student to issue this book to.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <Select value={issueStudentId} onValueChange={setIssueStudentId}>
                  <SelectTrigger className="h-9 bg-surface"><SelectValue placeholder="Select student" /></SelectTrigger>
                  <SelectContent>
                    {students.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}{s.class_name ? ` — ${s.class_name} ${s.section ?? ""}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setIssueOpen(null); setIssueStudentId(""); }} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={() => handleIssue(issueOpen)} disabled={!issueStudentId || saving}>
                  Issue Book
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Book</DialogTitle>
            <DialogDescription>Add a new title to the library catalogue.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => { e.preventDefault(); handleAddBook(); }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label>Title</Label><Input required placeholder="Book title" value={addTitle} onChange={(e) => setAddTitle(e.target.value)} /></div>
              <div className="space-y-1"><Label>Author</Label><Input placeholder="Author name" value={addAuthor} onChange={(e) => setAddAuthor(e.target.value)} /></div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saving}>Save Book</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
