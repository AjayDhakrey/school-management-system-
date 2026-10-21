import { downloadElementAsPdf } from "@/lib/pdf";
import { escapeHtml, printHtml } from "@/lib/print";

// Printable / downloadable salary slip. The same markup feeds the print iframe and the PDF render.

export type PayslipSchool = {
  name: string;
  address: string;
  phone?: string;
  email?: string;
  logoUrl?: string | null;
};

export type PayslipData = {
  employeeName: string;
  employeeCode: string;
  designation: string;
  department: string;
  period: string;
  basic: number;
  hra: number;
  allowance: number;
  gross: number;
  pfDeductions: number;
  leaveDeductions: number;
  net: number;
  paidDays?: number | undefined;
  workingDays?: number | undefined;
  status?: string | undefined;
  paymentMethod?: string | null | undefined;
  paymentReference?: string | null | undefined;
  paidOn?: string | null | undefined;
};

const rupee = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

// Every rule is scoped under .payslip so the CSS can also live inside the app document while the
// PDF is rendered, without leaking into the page.
const PAYSLIP_CSS = `
  @page { size: A4 portrait; margin: 14mm; }
  .payslip, .payslip * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .payslip { font-family: "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; font-size: 12px;
    background: #fff; width: 100%; max-width: 760px; margin: 0 auto; padding: 4px; }
  .payslip header { display: flex; justify-content: space-between; align-items: center; gap: 20px;
    border-bottom: 2px solid #1e3a8a; padding-bottom: 12px; margin-bottom: 16px; }
  .payslip .brand { display: flex; align-items: center; gap: 12px; }
  .payslip .brand img { width: 52px; height: 52px; object-fit: contain; }
  .payslip h1 { font-size: 19px; margin: 0 0 3px; color: #1e3a8a; }
  .payslip header p { margin: 0; color: #475569; line-height: 1.5; font-size: 11px; }
  .payslip .title { text-align: right; flex-shrink: 0; white-space: nowrap; }
  .payslip .brand > div { min-width: 0; }
  .payslip h2 { font-size: 15px; margin: 0; text-transform: uppercase; letter-spacing: .06em; }
  .payslip .info { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid #cbd5e1;
    border-radius: 6px; margin-bottom: 16px; }
  .payslip .info div { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; }
  .payslip .info div:nth-last-child(-n+3) { border-bottom: 0; }
  .payslip .info span { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: #64748b; }
  .payslip .info b { font-size: 12.5px; overflow-wrap: anywhere; }
  .payslip .cols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; }
  .payslip .info { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .payslip table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .payslip th:last-child, .payslip td:last-child { width: 38%; }
  .payslip th, .payslip td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; font-size: 12.5px; overflow-wrap: anywhere; }
  .payslip th { font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; background: #f1f5f9; color: #334155; }
  .payslip tfoot td { font-weight: 700; background: #f8fafc; }
  .payslip .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .payslip .neg { color: #dc2626; }
  .payslip .net { margin-top: 16px; display: flex; justify-content: space-between; align-items: center;
    border: 1px solid #1e3a8a; background: #eff6ff; border-radius: 8px; padding: 12px 16px; }
  .payslip .net span { display: block; color: #475569; font-size: 12px; }
  .payslip .net b { font-size: 22px; color: #1e3a8a; white-space: nowrap; }
  .payslip .words { margin-top: 8px; color: #334155; font-size: 12px; }
  .payslip .sign { margin-top: 48px; display: flex; justify-content: space-between; }
  .payslip .sign span { border-top: 1px solid #94a3b8; padding-top: 4px; min-width: 180px; text-align: center; color: #475569; font-size: 11px; }
  .payslip footer { margin-top: 18px; color: #64748b; font-size: 10.5px; text-align: center; }
`;

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven",
  "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n: number) {
  return n < 20 ? ONES[n]! : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}

/** Indian-system amount in words, e.g. 13500 → "Thirteen Thousand Five Hundred". */
function inWords(amount: number) {
  let n = Math.round(Math.max(0, amount));
  if (n === 0) return "Zero";
  const parts: string[] = [];
  for (const [size, label] of [
    [10_000_000, "Crore"],
    [100_000, "Lakh"],
    [1000, "Thousand"],
    [100, "Hundred"],
  ] as const) {
    if (n >= size) {
      const count = Math.floor(n / size);
      parts.push(`${count >= 100 ? inWords(count) : belowHundred(count)} ${label}`);
      n %= size;
    }
  }
  if (n) parts.push(belowHundred(n));
  return parts.join(" ");
}

function payslipBody(school: PayslipSchool, p: PayslipData) {
  const totalDeductions = p.pfDeductions + p.leaveDeductions;
  const contact = [school.phone, school.email].filter(Boolean).map(escapeHtml).join(" · ");
  const days =
    p.paidDays !== undefined
      ? `${p.paidDays}${p.workingDays ? ` / ${p.workingDays}` : ""}`
      : p.workingDays !== undefined
        ? String(p.workingDays)
        : "—";
  const info: [string, string][] = [
    ["Employee name", p.employeeName],
    ["Employee ID", p.employeeCode],
    ["Designation", p.designation],
    ["Department", p.department],
    ["Pay period", p.period],
    ["Paid days", days],
    ["Status", p.status ?? "—"],
    ["Payment mode", p.paymentMethod ?? "—"],
    ["Reference", p.paymentReference ?? (p.paidOn ? `Paid on ${p.paidOn}` : "—")],
  ];
  const earnings: [string, number][] = [
    ["Basic salary", p.basic],
    ["House rent allowance", p.hra],
    ["Special allowance", p.allowance],
  ];
  const deductions: [string, number][] = [["Provident fund & tax (PF)", p.pfDeductions]];
  if (p.leaveDeductions > 0) deductions.push(["Leave deduction", p.leaveDeductions]);

  const rows = (list: [string, number][], negative = false) =>
    list
      .map(
        ([label, value]) =>
          `<tr><td>${escapeHtml(label)}</td><td class="num${negative ? " neg" : ""}">${
            negative ? "−" : ""
          }${rupee(value)}</td></tr>`,
      )
      .join("");

  return `<div class="payslip">
    <header>
      <div class="brand">
        ${school.logoUrl ? `<img src="${escapeHtml(school.logoUrl)}" alt="" crossorigin="anonymous">` : ""}
        <div>
          <h1>${escapeHtml(school.name)}</h1>
          <p>${escapeHtml(school.address)}</p>
          ${contact ? `<p>${contact}</p>` : ""}
        </div>
      </div>
      <div class="title"><h2>Salary Slip</h2><p>${escapeHtml(p.period)}</p></div>
    </header>
    <div class="info">${info
      .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`)
      .join("")}</div>
    <div class="cols">
      <table>
        <thead><tr><th>Earnings</th><th class="num">Amount</th></tr></thead>
        <tbody>${rows(earnings)}</tbody>
        <tfoot><tr><td>Gross earnings</td><td class="num">${rupee(p.gross)}</td></tr></tfoot>
      </table>
      <table>
        <thead><tr><th>Deductions</th><th class="num">Amount</th></tr></thead>
        <tbody>${rows(deductions, true)}</tbody>
        <tfoot><tr><td>Total deductions</td><td class="num neg">−${rupee(totalDeductions)}</td></tr></tfoot>
      </table>
    </div>
    <div class="net">
      <div><span>Net salary payable</span><span>Gross ${rupee(p.gross)} − Deductions ${rupee(
        totalDeductions,
      )}</span></div>
      <b>${rupee(p.net)}</b>
    </div>
    <p class="words"><strong>In words:</strong> Rupees ${inWords(p.net)} Only</p>
    <div class="sign"><span>Employee signature</span><span>Authorised signatory</span></div>
    <footer>This is a computer-generated salary slip.</footer>
  </div>`;
}

function fileName(p: PayslipData) {
  const safe = (s: string) => s.replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "");
  return `Payslip-${safe(p.employeeName)}-${safe(p.period)}`;
}

/** Opens the browser print dialog with only the salary slip on the page. */
export function printPayslip(school: PayslipSchool, payslip: PayslipData) {
  printHtml(fileName(payslip), payslipBody(school, payslip), PAYSLIP_CSS);
}

/** Renders the salary slip off-screen and downloads it as an A4 PDF. */
export async function downloadPayslip(school: PayslipSchool, payslip: PayslipData) {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  // Off-screen but laid out at roughly A4 width so the PDF matches the printed version.
  host.style.cssText = "position:fixed;top:0;left:-10000px;width:760px;background:#fff;";
  host.innerHTML = `<style>${PAYSLIP_CSS}</style>${payslipBody(school, payslip)}`;
  document.body.appendChild(host);
  const slip = host.querySelector<HTMLElement>(".payslip")!;
  // The capture copies computed styles, so the centring margin would shift the clone right and
  // clip its right edge. Render at a fixed width with no margin, padded so nothing touches the edge.
  slip.style.cssText = "width:760px;max-width:none;margin:0;padding:24px;";
  try {
    await downloadElementAsPdf(slip, fileName(payslip));
  } finally {
    host.remove();
  }
}
