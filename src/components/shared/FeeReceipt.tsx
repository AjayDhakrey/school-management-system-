import { Printer, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { ApiFee, ApiSchool, ApiStudent } from "@/hooks/useApi";
import { feeTitle } from "@/lib/fees";

function currency(value: number) {
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function numberBelowThousand(value: number): string {
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];
  if (value < 20) return ones[value] ?? "";
  if (value < 100) return `${tens[Math.floor(value / 10)]} ${ones[value % 10]}`.trim();
  return `${ones[Math.floor(value / 100)]} Hundred ${numberBelowThousand(value % 100)}`.trim();
}

function amountInWords(value: number) {
  let rupees = Math.floor(value);
  if (rupees === 0) return "Zero Rupees Only";
  const parts: string[] = [];
  const units = [
    [10_000_000, "Crore"],
    [100_000, "Lakh"],
    [1_000, "Thousand"],
  ] as const;
  units.forEach(([size, label]) => {
    if (rupees >= size) {
      parts.push(`${numberBelowThousand(Math.floor(rupees / size))} ${label}`);
      rupees %= size;
    }
  });
  if (rupees) parts.push(numberBelowThousand(rupees));
  const paise = Math.round((value - Math.floor(value)) * 100);
  return `${parts.join(" ")} Rupees${paise ? ` and ${numberBelowThousand(paise)} Paise` : ""} Only`;
}

function formatDate(value?: string | null) {
  if (!value)
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date());
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(
        date,
      );
}

export function FeeReceipt({
  fee,
  student,
  school,
  receiptNo,
  transactionAmount,
}: {
  fee: ApiFee;
  student?: Pick<ApiStudent, "name" | "admission_no" | "class_name" | "section" | "roll"> | null;
  school?: Partial<ApiSchool> | null;
  receiptNo?: string | null;
  transactionAmount?: number;
}) {
  const assessed = fee.amount;
  const netPayable = Math.max(0, assessed - fee.discount + fee.fine);
  const amountPaid = transactionAmount ?? fee.paid_amount ?? netPayable;
  const totalPaid =
    transactionAmount === undefined
      ? (fee.paid_amount ?? amountPaid)
      : Math.min(netPayable, (fee.paid_amount ?? 0) + transactionAmount);
  const balance = Math.max(0, netPayable - totalPaid);
  const finalReceiptNo = receiptNo || fee.receipt_no || `RCPT-${fee.id.slice(0, 8).toUpperCase()}`;
  const classLabel = [student?.class_name, student?.section].filter(Boolean).join(" – ") || "—";

  return (
    <div>
      <article
        id="report-card"
        className="mx-auto max-w-3xl overflow-hidden rounded-xl border border-slate-300 bg-white text-slate-900 shadow-sm print:rounded-none print:border-0 print:shadow-none"
      >
        <div className="h-2 bg-primary" />
        <div className="p-5 sm:p-7 print:p-6">
          <header className="grid gap-4 border-b-2 border-slate-800 pb-5 sm:grid-cols-[1fr_auto] sm:items-start">
            <div className="flex items-start gap-3">
              {school?.logo_url ? (
                <img
                  src={school.logo_url}
                  alt={`${school.name ?? "School"} logo`}
                  className="h-16 w-16 object-contain"
                />
              ) : (
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full border-2 border-primary font-display text-lg font-bold text-primary">
                  {(school?.short_name || school?.name || "S").slice(0, 2).toUpperCase()}
                </span>
              )}
              <div>
                <h2 className="font-display text-xl font-bold uppercase tracking-wide text-primary sm:text-2xl">
                  {school?.name ?? "School Name"}
                </h2>
                {school?.tagline && (
                  <p className="text-xs font-medium italic text-slate-600">{school.tagline}</p>
                )}
                <p className="mt-1 max-w-md text-xs leading-5 text-slate-600">
                  {school?.address ?? "School address"}
                </p>
                <p className="text-xs text-slate-600">
                  {[school?.phone, school?.email, school?.website].filter(Boolean).join(" · ")}
                </p>
                {(school?.affiliation || school?.board) && (
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-500">
                    {[school.board, school.affiliation && `Affiliation No: ${school.affiliation}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
            </div>
            <div className="text-left sm:text-right">
              <p className="inline-block rounded bg-primary px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-white">
                Fee Receipt
              </p>
              <p className="mt-2 font-mono text-sm font-bold">{finalReceiptNo}</p>
              <p className="mt-1 text-xs text-slate-500">Date: {formatDate(fee.paid_on)}</p>
            </div>
          </header>

          <section className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-3">
            <div className="col-span-2 sm:col-span-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Student name
              </p>
              <p className="mt-0.5 font-semibold">{student?.name || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Admission no.
              </p>
              <p className="mt-0.5 font-medium">{student?.admission_no || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Class / section
              </p>
              <p className="mt-0.5 font-medium">{classLabel}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Roll number
              </p>
              <p className="mt-0.5 font-medium">{student?.roll ?? "—"}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Academic session
              </p>
              <p className="mt-0.5 font-medium">{school?.session || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Fee period
              </p>
              <p className="mt-0.5 font-medium">{fee.description || feeTitle(fee)}</p>
            </div>
          </section>

          <table className="mt-5 w-full text-sm">
            <thead>
              <tr className="bg-slate-800 text-left text-white">
                <th className="px-3 py-2.5 font-semibold">Particulars</th>
                <th className="px-3 py-2.5 text-right font-semibold">Amount (INR)</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-200">
                <td className="px-3 py-3">
                  <p className="font-medium">{feeTitle(fee)}</p>
                  {fee.description && <p className="text-xs text-slate-500">{fee.description}</p>}
                </td>
                <td className="px-3 py-3 text-right font-mono">{currency(assessed)}</td>
              </tr>
              {fee.discount > 0 && (
                <tr className="border-b border-slate-200 text-emerald-700">
                  <td className="px-3 py-2">Concession / scholarship</td>
                  <td className="px-3 py-2 text-right font-mono">− {currency(fee.discount)}</td>
                </tr>
              )}
              {fee.fine > 0 && (
                <tr className="border-b border-slate-200 text-red-700">
                  <td className="px-3 py-2">Late fee / fine</td>
                  <td className="px-3 py-2 text-right font-mono">+ {currency(fee.fine)}</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-800">
                <td className="px-3 pt-3 text-right font-semibold">Net fee payable</td>
                <td className="px-3 pt-3 text-right font-mono font-bold">{currency(netPayable)}</td>
              </tr>
              <tr>
                <td className="px-3 py-1 text-right font-semibold text-primary">Amount received</td>
                <td className="px-3 py-1 text-right font-mono text-base font-bold text-primary">
                  {currency(amountPaid)}
                </td>
              </tr>
              <tr>
                <td className="px-3 py-1 text-right text-slate-600">Balance due</td>
                <td className="px-3 py-1 text-right font-mono font-semibold">
                  {currency(balance)}
                </td>
              </tr>
            </tfoot>
          </table>

          <div className="mt-5 rounded-lg border border-dashed border-slate-300 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Amount received in words
            </p>
            <p className="mt-1 text-sm font-semibold">{amountInWords(amountPaid)}</p>
          </div>

          <section className="mt-5 grid gap-3 text-xs sm:grid-cols-3">
            <div>
              <p className="text-slate-500">Payment status</p>
              <p className="mt-1 inline-flex rounded-full bg-emerald-100 px-2.5 py-1 font-bold uppercase tracking-wide text-emerald-700">
                {balance === 0 ? "Paid in full" : "Part payment"}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Payment mode</p>
              <p className="mt-1 font-semibold">Online / recorded payment</p>
            </div>
            <div>
              <p className="text-slate-500">Transaction reference</p>
              <p className="mt-1 font-mono font-semibold">{finalReceiptNo}</p>
            </div>
          </section>

          <div className="mt-10 flex items-end justify-between">
            <div className="flex max-w-xs items-start gap-2 text-[10px] leading-4 text-slate-500">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                This is a computer-generated receipt and is valid without a physical signature.
                Please retain it for your records.
              </span>
            </div>
            <div className="w-44 text-center">
              <div className="border-t border-slate-500 pt-1 text-xs font-semibold">
                Authorized Signatory
              </div>
              <p className="text-[10px] text-slate-500">Accounts Department</p>
            </div>
          </div>
          <Separator className="my-5 bg-slate-200" />
          <footer className="flex flex-wrap justify-between gap-2 text-[10px] text-slate-500">
            <span>Generated on {formatDate(new Date().toISOString())}</span>
            <span>Thank you for your payment</span>
            <span>School copy / Student copy</span>
          </footer>
        </div>
      </article>
      <Button className="mt-4 w-full gap-2 print:hidden" onClick={() => window.print()}>
        <Printer className="h-4 w-4" /> Print / Save as PDF
      </Button>
    </div>
  );
}
