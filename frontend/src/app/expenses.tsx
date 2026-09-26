"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, IndianRupee, Layers, Plus, Trash2 } from "lucide-react";
import { PageHeader, EmptyState, SearchInput, Pager, usePaged } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  useExpenses,
  useExpenseCategories,
  useVendors,
  useFinancialSettings,
  type ApiExpense,
  type PaymentMethod,
} from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";

const DEFAULT_PAYMENT_METHODS: PaymentMethod[] = ["Cash", "UPI", "Card", "Bank Transfer", "Cheque", "Online"];
const NONE = "__none__";

function AddExpenseDialog({
  categories,
  vendors,
  onDone,
}: {
  categories: { id: string; name: string }[];
  vendors: { id: string; name: string }[];
  onDone: () => void;
}) {
  const { data: settings } = useFinancialSettings();
  const methods = settings?.accepted_payment_methods ?? DEFAULT_PAYMENT_METHODS;
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState(NONE);
  const [vendorId, setVendorId] = useState(NONE);
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<PaymentMethod>("Cash");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !Number(amount) || Number(amount) <= 0) {
      toast.error("Title and a positive amount are required");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/expenses", {
        title: title.trim(),
        amount: Number(amount),
        categoryId: categoryId === NONE ? null : categoryId,
        vendorId: vendorId === NONE ? null : vendorId,
        expenseDate,
        paymentMethod: method,
        notes: notes.trim() || null,
      });
      toast.success("Expense recorded");
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to record expense");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Record Expense</DialogTitle>
        <DialogDescription>Log a school expense against a category and vendor.</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="grid gap-3">
        <div className="grid gap-1.5">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Classroom furniture" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label>Amount (₹)</Label>
            <Input type="number" min={1} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Date</Label>
            <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="bg-surface">
                <SelectValue placeholder="Uncategorized" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Uncategorized</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Vendor</Label>
            <Select value={vendorId} onValueChange={setVendorId}>
              <SelectTrigger className="bg-surface">
                <SelectValue placeholder="No vendor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No vendor</SelectItem>
                {vendors.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label>Payment Method</Label>
          <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
            <SelectTrigger className="bg-surface">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {methods.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Notes (optional)</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Record Expense"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function AddCategoryDialog({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Category name is required");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/expense-categories", { name: name.trim() });
      toast.success("Category added");
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to add category");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle>Add Expense Category</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="grid gap-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Utilities" />
        <DialogFooter>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Add Category"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function AddVendorDialog({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Vendor name is required");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/vendors", {
        name: name.trim(),
        contactPerson: contact.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
      });
      toast.success("Vendor added");
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to add vendor");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle>Add Vendor</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="grid gap-3">
        <div className="grid gap-1.5">
          <Label>Vendor Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label>Contact Person</Label>
          <Input value={contact} onChange={(e) => setContact(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Add Vendor"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

export default function ExpensesPage({
  tab = "expenses",
}: {
  tab?: "expenses" | "categories" | "vendors";
}) {
  const { data: expenses, isLoading } = useExpenses();
  const { data: categories } = useExpenseCategories();
  const { data: vendors } = useVendors();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [addVendorOpen, setAddVendorOpen] = useState(false);

  const categoriesById = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c.name])), [categories]);
  const vendorsById = useMemo(() => new Map((vendors ?? []).map((v) => [v.id, v.name])), [vendors]);

  const filtered = useMemo(
    () =>
      (expenses ?? []).filter(
        (e) =>
          search === "" ||
          e.title.toLowerCase().includes(search.toLowerCase()) ||
          (categoriesById.get(e.category_id ?? "") ?? "").toLowerCase().includes(search.toLowerCase()) ||
          (vendorsById.get(e.vendor_id ?? "") ?? "").toLowerCase().includes(search.toLowerCase()),
      ),
    [expenses, search, categoriesById, vendorsById],
  );
  const { rows, pageCount } = usePaged(filtered, page, 10);

  const totalExpenses = (expenses ?? []).reduce((s, e) => s + e.amount, 0);
  const monthStr = new Date().toISOString().slice(0, 7);
  const thisMonth = (expenses ?? [])
    .filter((e) => e.expense_date.slice(0, 7) === monthStr)
    .reduce((s, e) => s + e.amount, 0);

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ["expenses"] });
    await queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
    await queryClient.invalidateQueries({ queryKey: ["vendors"] });
  }

  async function handleDelete(e: ApiExpense) {
    if (!confirm(`Remove the "${e.title}" expense?`)) return;
    try {
      await api.delete(`/expenses/${e.id}`);
      toast.success("Expense removed");
      await invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to remove expense");
    }
  }

  return (
    <div>
      <PageHeader
        title="Expenses"
        description="Track school expenses, categories and vendors."
        breadcrumb={["Dashboard", "Expenses"]}
      />

      <Tabs defaultValue={tab} className="w-full">
        <div className="scrollbar-slim mb-4 overflow-x-auto">
          <TabsList className="w-max flex-nowrap justify-start gap-1">
            <TabsTrigger value="expenses" className="gap-1.5">
              <IndianRupee className="h-3.5 w-3.5" /> Expenses ({(expenses ?? []).length})
            </TabsTrigger>
            <TabsTrigger value="categories" className="gap-1.5">
              <Layers className="h-3.5 w-3.5" /> Categories ({(categories ?? []).length})
            </TabsTrigger>
            <TabsTrigger value="vendors" className="gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> Vendors ({(vendors ?? []).length})
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="expenses">
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-2">
            <div className="panel p-3.5">
              <p className="text-xs text-muted-foreground">Total Expenses</p>
              <p className="mt-0.5 font-display text-xl font-bold">₹{totalExpenses.toLocaleString()}</p>
            </div>
            <div className="panel p-3.5">
              <p className="text-xs text-muted-foreground">This Month</p>
              <p className="mt-0.5 font-display text-xl font-bold">₹{thisMonth.toLocaleString()}</p>
            </div>
          </div>
          <SectionCard
            bodyClassName="p-0"
            action={
              <div className="flex flex-wrap items-center gap-2">
                <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search expenses…" />
                <Dialog open={addExpenseOpen} onOpenChange={setAddExpenseOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-1.5">
                      <Plus className="h-4 w-4" /> Add Expense
                    </Button>
                  </DialogTrigger>
                  <AddExpenseDialog
                    categories={categories ?? []}
                    vendors={vendors ?? []}
                    onDone={async () => {
                      await invalidate();
                      setAddExpenseOpen(false);
                    }}
                  />
                </Dialog>
              </div>
            }
          >
            {isLoading ? (
              <p className="p-6 text-center text-sm text-muted-foreground">Loading expenses…</p>
            ) : rows.length === 0 ? (
              <EmptyState title="No expenses recorded" description="Expenses you add will appear here." icon={IndianRupee} />
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Title</th>
                        <th className="px-4 py-2.5 font-medium">Category</th>
                        <th className="px-4 py-2.5 font-medium">Vendor</th>
                        <th className="px-4 py-2.5 font-medium">Date</th>
                        <th className="px-4 py-2.5 font-medium text-right">Amount</th>
                        <th className="px-4 py-2.5 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((e) => (
                        <tr key={e.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                          <td className="px-4 py-2.5 font-medium">{e.title}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{categoriesById.get(e.category_id ?? "") ?? "—"}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{vendorsById.get(e.vendor_id ?? "") ?? "—"}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{e.expense_date}</td>
                          <td className="px-4 py-2.5 text-right font-semibold">₹{e.amount.toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-right">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(e)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="grid gap-2.5 p-4 md:hidden">
                  {rows.map((e) => (
                    <div key={e.id} className="min-w-0 overflow-hidden rounded-xl border border-border p-3">
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{e.title}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {categoriesById.get(e.category_id ?? "") ?? "Uncategorized"} · {e.expense_date}
                          </p>
                        </div>
                        <span className="shrink-0 font-semibold">₹{e.amount.toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <Pager page={page} pageCount={pageCount} onPage={setPage} total={filtered.length} />
              </>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="categories">
          <SectionCard
            bodyClassName="p-0"
            action={
              <Dialog open={addCategoryOpen} onOpenChange={setAddCategoryOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-1.5">
                    <Plus className="h-4 w-4" /> Add Category
                  </Button>
                </DialogTrigger>
                <AddCategoryDialog
                  onDone={async () => {
                    await invalidate();
                    setAddCategoryOpen(false);
                  }}
                />
              </Dialog>
            }
          >
            {(categories ?? []).length === 0 ? (
              <EmptyState title="No categories yet" description="Add categories to organize your expenses." icon={Layers} />
            ) : (
              <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {(categories ?? []).map((c) => (
                  <div key={c.id} className="flex items-center gap-2.5 rounded-xl border border-border p-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Layers className="h-4 w-4" />
                    </span>
                    <span className="truncate text-sm font-medium">{c.name}</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="vendors">
          <SectionCard
            bodyClassName="p-0"
            action={
              <Dialog open={addVendorOpen} onOpenChange={setAddVendorOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-1.5">
                    <Plus className="h-4 w-4" /> Add Vendor
                  </Button>
                </DialogTrigger>
                <AddVendorDialog
                  onDone={async () => {
                    await invalidate();
                    setAddVendorOpen(false);
                  }}
                />
              </Dialog>
            }
          >
            {(vendors ?? []).length === 0 ? (
              <EmptyState title="No vendors yet" description="Vendors you add can be linked to expenses." icon={Building2} />
            ) : (
              <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {(vendors ?? []).map((v) => (
                  <div key={v.id} className="rounded-xl border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{v.name}</span>
                      <StatusBadge status={v.status} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {v.contact_person ?? "—"} {v.phone ? `· ${v.phone}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
