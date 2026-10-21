import type { ApiFee } from "@/hooks/useApi";
import { billingMonthOf, feeTitle, sortStudentFees } from "@/lib/fees";
import { escapeHtml, printHtml } from "@/lib/print";

// Printable fee statement for one student: totals, a month-by-month grid and every bill.

const rupee = (n: number) => `₹${n.toLocaleString()}`;
/** What the student actually owes on a bill: amount less discount plus fine. */
const payable = (f: ApiFee) => Math.max(0, f.amount - f.discount + f.fine);
const paidOn = (f: ApiFee) =>
  Math.min(f.paid_amount ?? (f.status === "Paid" ? payable(f) : 0), payable(f));
/** The date-aware status ("Overdue" once the due date passes), falling back to the stored one. */
const statusOf = (f: ApiFee) => f.calculated_status ?? f.status;

function readableDate(value: string | null | undefined) {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export type StatementStudent = {
  name: string;
  class_name?: string | null;
  section?: string | null;
  roll?: number | null;
  admission_no?: string | null;
};

const STATEMENT_CSS = `
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; margin: 0; font-size: 11.5px; }
  header { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px;
    border-bottom: 2px solid #1e3a8a; padding-bottom: 10px; margin-bottom: 14px; }
  h1 { font-size: 20px; margin: 0 0 3px; color: #1e3a8a; }
  header p { margin: 0; color: #475569; line-height: 1.5; }
  .title { text-align: right; }
  h2 { font-size: 15px; margin: 0 0 2px; text-transform: uppercase; letter-spacing: .06em; }
  .grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
  .grid4 div { border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 10px; }
  .grid4 span { display: block; font-size: 9px; text-transform: uppercase; letter-spacing: .06em; color: #64748b; }
  .grid4 b { font-size: 12.5px; }
  .stats b { font-size: 16px; }
  .bar { height: 7px; border-radius: 99px; background: #e2e8f0; overflow: hidden; margin: -4px 0 6px; }
  .bar i { display: block; height: 100%; background: #3b82f6; }
  .counts { color: #475569; margin-bottom: 4px; }
  h3 { font-size: 12px; margin: 14px 0 6px; text-transform: uppercase; letter-spacing: .05em; color: #334155; }
  .months { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; }
  .months div { border: 1px solid #cbd5e1; border-radius: 6px; padding: 5px 7px; }
  .months b { display: block; font-size: 11px; }
  .months small { font-size: 9px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
  th { font-size: 9.5px; text-transform: uppercase; letter-spacing: .04em; background: #f1f5f9; color: #334155; }
  tfoot td { font-weight: 700; background: #f8fafc; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .paid { color: #15803d; } .late { color: #dc2626; } .due { color: #b45309; }
  .bg-paid { background: #ecfdf5; border-color: #86efac !important; }
  .bg-late { background: #fef2f2; border-color: #fca5a5 !important; }
  .bg-part { background: #fffbeb; border-color: #fcd34d !important; }
  tr { break-inside: avoid; }
  footer { margin-top: 18px; display: flex; justify-content: space-between; color: #64748b; font-size: 9.5px; }
  .sign { margin-top: 36px; display: flex; justify-content: flex-end; }
  .sign span { border-top: 1px solid #94a3b8; padding-top: 4px; min-width: 180px; text-align: center; color: #475569; }
`;

/** Prints one student's full fee statement (portrait A4). */
export function printFeeStatement(
  school: { name: string; address: string; phone?: string; email?: string; session?: string },
  student: StatementStudent,
  fees: ApiFee[],
) {
  const sorted = [...fees].sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
  const billed = sorted.reduce((sum, f) => sum + payable(f), 0);
  const paid = sorted.reduce((sum, f) => sum + paidOn(f), 0);
  const due = Math.max(0, billed - paid);
  const percent = billed ? Math.round((paid / billed) * 100) : 0;

  const months = new Map<string, ApiFee[]>();
  for (const f of sorted) {
    const month = billingMonthOf(f);
    if (month) months.set(month, [...(months.get(month) ?? []), f]);
  }
  let monthsPaid = 0;
  let monthsLate = 0;
  const monthTiles = Array.from(months)
    .map(([month, list]) => {
      const mBilled = list.reduce((sum, f) => sum + payable(f), 0);
      const mPaid = list.reduce((sum, f) => sum + paidOn(f), 0);
      const late = list.some((f) => paidOn(f) < payable(f) && statusOf(f) === "Overdue");
      const done = mPaid >= mBilled;
      if (done) monthsPaid += 1;
      else if (late) monthsLate += 1;
      const [label, cls, bg] = done
        ? ["Paid", "paid", "bg-paid"]
        : late
          ? ["Overdue", "late", "bg-late"]
          : mPaid > 0
            ? ["Part-paid", "due", "bg-part"]
            : ["Due", "due", ""];
      return `<div class="${bg}"><b>${escapeHtml(month)}</b>${rupee(done ? mBilled : mBilled - mPaid)}<br><small class="${cls}">${label}</small></div>`;
    })
    .join("");
  const monthsDue = months.size - monthsPaid - monthsLate;

  const rows = sortStudentFees(sorted)
    .map((f) => {
      const owed = Math.max(0, payable(f) - paidOn(f));
      const status = owed === 0 ? "Paid" : statusOf(f);
      const cls = status === "Paid" ? "paid" : status === "Overdue" ? "late" : "due";
      return `<tr><td>${escapeHtml(feeTitle(f))}</td><td>${readableDate(f.due_date)}</td><td class="num">${rupee(
        payable(f),
      )}</td><td class="num">${rupee(paidOn(f))}</td><td class="num">${rupee(owed)}</td><td class="${cls}">${escapeHtml(
        status,
      )}</td></tr>`;
    })
    .join("");

  const contact = [school.phone, school.email]
    .filter(Boolean)
    .map((v) => escapeHtml(v))
    .join(" · ");
  const printed = new Date().toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const cls = `${student.class_name ?? "—"}${student.section ? `-${student.section}` : ""}`;

  printHtml(
    `Fee Statement — ${student.name}`,
    `<header>
      <div>
        <h1>${escapeHtml(school.name)}</h1>
        <p>${escapeHtml(school.address)}${contact ? `<br>${contact}` : ""}</p>
      </div>
      <div class="title">
        <h2>Fee Statement</h2>
        <p>${school.session ? `Session ${escapeHtml(school.session)} · ` : ""}${printed}</p>
      </div>
    </header>
    <div class="grid4">
      <div><span>Student</span><b>${escapeHtml(student.name)}</b></div>
      <div><span>Class</span><b>${escapeHtml(cls)}</b></div>
      <div><span>Roll No.</span><b>${student.roll ?? "—"}</b></div>
      <div><span>Admission No.</span><b>${escapeHtml(student.admission_no ?? "—")}</b></div>
    </div>
    <div class="grid4 stats">
      <div><span>Billed</span><b>${rupee(billed)}</b></div>
      <div><span>Paid</span><b class="paid">${rupee(paid)}</b></div>
      <div><span>Due</span><b class="${due ? "late" : "paid"}">${rupee(due)}</b></div>
      <div><span>Paid so far</span><b>${percent}%</b></div>
    </div>
    <div class="bar"><i style="width:${percent}%"></i></div>
    ${
      months.size
        ? `<p class="counts"><b class="paid">${monthsPaid}</b> month${monthsPaid === 1 ? "" : "s"} paid · <b>${monthsDue}</b> due · <b class="late">${monthsLate}</b> overdue</p>
           <h3>Month by month</h3><div class="months">${monthTiles}</div>`
        : ""
    }
    <h3>All bills</h3>
    ${
      rows
        ? `<table>
            <thead><tr><th>Fee</th><th>Due date</th><th class="num">Amount</th><th class="num">Paid</th><th class="num">Balance</th><th>Status</th></tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr><td colspan="2">Total</td><td class="num">${rupee(billed)}</td><td class="num paid">${rupee(paid)}</td><td class="num ${due ? "late" : "paid"}">${rupee(due)}</td><td></td></tr></tfoot>
          </table>`
        : "<p>No fees billed yet.</p>"
    }
    <div class="sign"><span>School Office</span></div>
    <footer><span>This is a computer-generated statement.</span><span>Printed ${printed}</span></footer>`,
    STATEMENT_CSS,
  );
}

export type PaymentSlip = {
  receiptNo: string;
  paidOn: string;
  studentName: string;
  classLabel: string;
  admissionNo: string;
  feeLabel: string;
  dueDate: string | null;
  amount: number;
  discount: number;
  fine: number;
  netPayable: number;
  paidBefore: number;
  paidNow: number;
  balance: number;
  amountInWords: string;
  method: string;
  reference: string | null;
  collectedBy: string | null;
};

const SLIP_CSS = `
  @page { size: A5 portrait; margin: 10mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; margin: 0; font-size: 11px; }
  .slip { border: 1.5px solid #1e3a8a; border-radius: 8px; padding: 12px 14px; }
  header { text-align: center; border-bottom: 1.5px solid #1e3a8a; padding-bottom: 8px; margin-bottom: 10px; }
  h1 { font-size: 17px; margin: 0 0 2px; color: #1e3a8a; }
  header p { margin: 0; color: #475569; line-height: 1.45; font-size: 10px; }
  .title { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  .title h2 { font-size: 13px; margin: 0; letter-spacing: .12em; text-transform: uppercase;
    background: #1e3a8a; color: #fff; padding: 3px 10px; border-radius: 4px; }
  .title div { text-align: right; font-size: 10px; color: #475569; }
  .title b { color: #0f172a; font-family: Consolas, monospace; font-size: 11px; }
  .info { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; margin-bottom: 10px; }
  .info span { color: #64748b; } .info b { font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  td { border: 1px solid #cbd5e1; padding: 5px 8px; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr.now td { background: #ecfdf5; font-weight: 700; color: #15803d; font-size: 12.5px; }
  tr.bal td { font-weight: 700; }
  .words { border: 1px dashed #94a3b8; border-radius: 6px; padding: 6px 8px; margin-bottom: 8px; }
  .words span { color: #64748b; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; margin-bottom: 18px; }
  .meta span { color: #64748b; }
  .paid-stamp { display: inline-block; border: 2px solid #15803d; color: #15803d; font-weight: 800;
    letter-spacing: .15em; padding: 2px 10px; border-radius: 4px; transform: rotate(-6deg); }
  .part-stamp { border-color: #b45309; color: #b45309; }
  .foot { display: flex; justify-content: space-between; align-items: flex-end; }
  .sign { border-top: 1px solid #94a3b8; padding-top: 3px; min-width: 150px; text-align: center; color: #475569; }
  .note { margin-top: 10px; text-align: center; color: #94a3b8; font-size: 9px; }
`;

/** Prints the receipt for one payment (A5, half an A4 sheet). */
export function printPaymentSlip(
  school: { name: string; address: string; phone?: string; email?: string },
  slip: PaymentSlip,
) {
  const contact = [school.phone, school.email]
    .filter(Boolean)
    .map((v) => escapeHtml(v))
    .join(" · ");
  const row = (label: string, value: string, cls = "") =>
    `<tr class="${cls}"><td>${label}</td><td class="num">${value}</td></tr>`;
  printHtml(
    `Receipt ${slip.receiptNo}`,
    `<div class="slip">
      <header>
        <h1>${escapeHtml(school.name)}</h1>
        <p>${escapeHtml(school.address)}${contact ? `<br>${contact}` : ""}</p>
      </header>
      <div class="title">
        <h2>Payment Receipt</h2>
        <div>Receipt No. <b>${escapeHtml(slip.receiptNo)}</b><br>Date ${readableDate(slip.paidOn)}</div>
      </div>
      <div class="info">
        <div><span>Student:</span> <b>${escapeHtml(slip.studentName)}</b></div>
        <div><span>Class:</span> <b>${escapeHtml(slip.classLabel || "—")}</b></div>
        <div><span>Admission No.:</span> <b>${escapeHtml(slip.admissionNo || "—")}</b></div>
        <div><span>Due date:</span> <b>${readableDate(slip.dueDate)}</b></div>
        <div style="grid-column: span 2"><span>Fee:</span> <b>${escapeHtml(slip.feeLabel)}</b></div>
      </div>
      <table>
        ${row("Fee amount", rupee(slip.amount))}
        ${slip.discount ? row("Discount / scholarship", `− ${rupee(slip.discount)}`) : ""}
        ${slip.fine ? row("Late fine", `+ ${rupee(slip.fine)}`) : ""}
        ${row("Net payable", rupee(slip.netPayable))}
        ${slip.paidBefore ? row("Paid earlier", `− ${rupee(slip.paidBefore)}`) : ""}
        ${row("Paid now", rupee(slip.paidNow), "now")}
        ${row("Balance remaining", slip.balance ? rupee(slip.balance) : "Nil", "bal")}
      </table>
      <div class="words"><span>Amount in words:</span> <b>${escapeHtml(slip.amountInWords)}</b></div>
      <div class="meta">
        ${slip.method ? `<div><span>Payment mode:</span> <b>${escapeHtml(slip.method)}</b></div>` : ""}
        ${slip.reference ? `<div><span>Reference:</span> <b>${escapeHtml(slip.reference)}</b></div>` : ""}
        ${slip.collectedBy ? `<div><span>Received by:</span> <b>${escapeHtml(slip.collectedBy)}</b></div>` : ""}
      </div>
      <div class="foot">
        <span class="paid-stamp ${slip.balance ? "part-stamp" : ""}">${slip.balance ? "PART PAID" : "PAID"}</span>
        <span class="sign">Authorised Signatory</span>
      </div>
      <p class="note">This is a computer-generated receipt.</p>
    </div>`,
    SLIP_CSS,
  );
}
