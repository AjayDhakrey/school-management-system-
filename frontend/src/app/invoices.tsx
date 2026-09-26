"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileText, Plus, Trash2 } from "lucide-react";
import { PageHeader, EmptyState, SearchInput, Pager, usePaged } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { InfoCard } from "@/components/shared/InfoCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
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
  DialogFooter,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { useInvoices, useVendors, type ApiInvoice } from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";

const NONE = "__none__";

function AddInvoiceDialog({ vendors, onDone }: { vendors: { id: string; name: string }[]; onDone: () => void }) {
  const [invoiceNo, setInvoiceNo] = useState(() => `INV-${Date.now().toString().slice(-6)}`);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [vendorId, setVendorId] = useState(NONE);
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!invoiceNo.trim() || !title.trim() || !Number(amount) || Number(amount) <= 0) {
      toast.error("Invoice number, title and a positive amount are required");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/invoices", {
        invoiceNo: invoiceNo.trim(),
        title: title.trim(),
        amount: Number(amount),
        vendorId: vendorId === NONE ? null : vendorId,
        dueDate,
        notes: notes.trim() || null,
      });
      toast.success("Invoice created");
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create invoice");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>New Invoice</DialogTitle>
        <DialogDescription>Bill owed to a vendor or payee.</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label>Invoice No.</Label>
            <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Due Date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Annual internet subscription" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label>Amount (₹)</Label>
            <Input type="number" min={1} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
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
          <Label>Notes (optional)</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Create Invoice"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

export default function InvoicesPage() {
  const { data: invoices, isLoading } = useInvoices();
  const { data: vendors } = useVendors();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);

  const vendorsById = useMemo(() => new Map((vendors ?? []).map((v) => [v.id, v.name])), [vendors]);

  const filtered = useMemo(
    () =>
      (invoices ?? []).filter(
        (i) =>
          search === "" ||
          i.title.toLowerCase().includes(search.toLowerCase()) ||
          i.invoice_no.toLowerCase().includes(search.toLowerCase()),
      ),
    [invoices, search],
  );
  const { rows, pageCount } = usePaged(filtered, page, 10);

  const unpaidTotal = (invoices ?? [])
    .filter((i) => i.status === "Unpaid" || i.status === "Overdue")
    .reduce((s, i) => s + i.amount, 0);
  const paidTotal = (invoices ?? []).filter((i) => i.status === "Paid").reduce((s, i) => s + i.amount, 0);

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ["invoices"] });
  }

  async function markPaid(invoice: ApiInvoice) {
    try {
      await api.patch(`/invoices/${invoice.id}`, { status: "Paid", paidOn: new Date().toISOString() });
      toast.success("Invoice marked paid");
      await invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update invoice");
    }
  }

  async function handleDelete(invoice: ApiInvoice) {
    if (!confirm(`Remove invoice ${invoice.invoice_no}?`)) return;
    try {
      await api.delete(`/invoices/${invoice.id}`);
      toast.success("Invoice removed");
      await invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to remove invoice");
    }
  }

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Bills owed to vendors and other payees."
        breadcrumb={["Dashboard", "Invoices"]}
        actions={
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> New Invoice
              </Button>
            </DialogTrigger>
            <AddInvoiceDialog
              vendors={vendors ?? []}
              onDone={async () => {
                await invalidate();
                setAddOpen(false);
              }}
            />
          </Dialog>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-2">
        <InfoCard label="Unpaid / Overdue" value={`₹${unpaidTotal.toLocaleString()}`} icon={FileText} tone="warning" />
        <InfoCard label="Paid" value={`₹${paidTotal.toLocaleString()}`} icon={CheckCircle2} tone="success" />
      </div>

      <SectionCard
        bodyClassName="p-0"
        action={
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search invoices…" />
        }
      >
        {isLoading ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Loading invoices…</p>
        ) : rows.length === 0 ? (
          <EmptyState title="No invoices yet" description="Invoices you create will appear here." icon={FileText} />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Invoice No.</th>
                    <th className="px-4 py-2.5 font-medium">Title</th>
                    <th className="px-4 py-2.5 font-medium">Vendor</th>
                    <th className="px-4 py-2.5 font-medium">Due Date</th>
                    <th className="px-4 py-2.5 font-medium text-right">Amount</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((i) => (
                    <tr key={i.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-mono text-xs">{i.invoice_no}</td>
                      <td className="px-4 py-2.5 font-medium">{i.title}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{vendorsById.get(i.vendor_id ?? "") ?? "—"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{i.due_date ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right font-semibold">₹{i.amount.toLocaleString()}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={i.status} />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {i.status !== "Paid" && (
                            <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => markPaid(i)}>
                              <CheckCircle2 className="h-3.5 w-3.5" /> Mark Paid
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(i)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-2.5 p-4 md:hidden">
              {rows.map((i) => (
                <div key={i.id} className="min-w-0 overflow-hidden rounded-xl border border-border p-3">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{i.title}</p>
                      <p className="truncate font-mono text-[11px] text-muted-foreground">{i.invoice_no}</p>
                    </div>
                    <StatusBadge status={i.status} className="shrink-0" />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Due {i.due_date ?? "—"}</span>
                    <span className="font-semibold text-foreground">₹{i.amount.toLocaleString()}</span>
                  </div>
                  {i.status !== "Paid" && (
                    <Button size="sm" variant="outline" className="mt-3 w-full gap-1.5" onClick={() => markPaid(i)}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Mark Paid
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <Pager page={page} pageCount={pageCount} onPage={setPage} total={filtered.length} />
          </>
        )}
      </SectionCard>
    </div>
  );
}
