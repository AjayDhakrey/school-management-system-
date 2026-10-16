import { escapeHtml, printHtml } from "@/lib/print";
import type { SchoolBranding } from "@/hooks/use-school-branding";

export type CertificateStudent = {
  name: string;
  roll?: string | number | null;
  admission_no?: string | null;
  class_name?: string | null;
  section?: string | null;
  dob?: string | null;
  admitted_on?: string | null;
  gender?: string | null;
};

const fmt = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
};

const CSS = `
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Georgia, "Times New Roman", serif; color: #0f172a; margin: 0; background: #fff; }
  .frame { border: 3px double #1e3a8a; padding: 28px 36px; min-height: 260mm; display: flex; flex-direction: column; }
  header { text-align: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 12px; }
  header img { height: 64px; margin-bottom: 6px; }
  h1 { font-size: 24px; margin: 0; color: #1e3a8a; letter-spacing: .02em; text-transform: uppercase; }
  header p { margin: 3px 0 0; font-family: "Segoe UI", Arial, sans-serif; font-size: 11px; color: #475569; }
  .meta { display: flex; justify-content: space-between; margin: 14px 0 0; font-family: "Segoe UI", Arial, sans-serif; font-size: 11px; color: #334155; }
  h2 { text-align: center; font-size: 22px; letter-spacing: .14em; text-transform: uppercase; margin: 28px 0 22px; text-decoration: underline; text-underline-offset: 6px; color: #1e3a8a; }
  .body { font-size: 15px; line-height: 2; text-align: justify; }
  .body b { border-bottom: 1px dotted #475569; padding: 0 4px; }
  table { width: 100%; border-collapse: collapse; margin: 22px 0 0; font-family: "Segoe UI", Arial, sans-serif; font-size: 12.5px; }
  td { border: 1px solid #cbd5e1; padding: 8px 10px; }
  td.k { width: 38%; background: #f1f5f9; color: #334155; font-weight: 600; }
  .spacer { flex: 1; }
  footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 56px; font-family: "Segoe UI", Arial, sans-serif; font-size: 12px; }
  .sign { border-top: 1px solid #475569; padding-top: 5px; width: 190px; text-align: center; color: #334155; }
  .seal { width: 90px; height: 90px; border: 1.5px dashed #94a3b8; border-radius: 50%; display: grid; place-items: center; color: #94a3b8; font-size: 10px; }
`;

const TEXT: Record<string, (name: string, roll: string, adm: string, p: string, s: string) => string> = {
  BONAFIDE: (n, r, a, p, s) =>
    `This is to certify that <b>${n}</b>, bearing Roll No. <b>${r}</b> and Admission No. <b>${a}</b>, is a bona fide student of <b>${s}</b>. ${p} ${p === "They" ? "are" : "is"} studying in this school as per the particulars detailed below. According to school records, ${p === "They" ? "their" : p === "She" ? "her" : "his"} conduct and character have been good. This certificate is issued upon request for official and academic purposes.`,
  TRANSFER: (n, r, a, p, s) =>
    `This is to certify that <b>${n}</b>, bearing Roll No. <b>${r}</b> and Admission No. <b>${a}</b>, was a bona fide student of <b>${s}</b>. ${p} ${p === "They" ? "have" : "has"} cleared all school dues, fees, and library accounts and ${p === "They" ? "are" : "is"} granted this Transfer Certificate on leaving the school. ${p === "They" ? "Their" : p === "She" ? "Her" : "His"} conduct and moral character have been good. We wish ${p === "She" ? "her" : p === "He" ? "him" : "them"} every success in future academic endeavors.`,
  CHARACTER: (n, r, a, p, s) =>
    `This is to certify that <b>${n}</b>, bearing Roll No. <b>${r}</b> and Admission No. <b>${a}</b>, has been a bona fide student of <b>${s}</b>. During ${p === "They" ? "their" : p === "She" ? "her" : "his"} study here, ${p.toLowerCase()} bore an exemplary moral character and pleasant conduct. To the best of our knowledge and records, ${p.toLowerCase()} ${p === "They" ? "have" : "has"} not taken part in any activity adverse to the school or society.`,
};

/** Prints a certificate on its own A4 page with the school header and signatures. */
export function printCertificate(
  school: SchoolBranding,
  opts: {
    type: string;
    typeLabel: string;
    student: CertificateStudent;
    issuedOn: string;
    issuedBy?: string | null;
    serial?: string;
  },
) {
  const { student } = opts;
  const gender = (student.gender ?? "").toLowerCase();
  const pronoun = gender.startsWith("f") ? "She" : gender.startsWith("m") ? "He" : "They";
  const rollStr = student.roll != null && student.roll !== "" ? String(student.roll) : "—";
  const admStr = student.admission_no ?? "—";
  const text = (TEXT[opts.type] ?? TEXT["BONAFIDE"]!)(
    escapeHtml(student.name),
    escapeHtml(rollStr),
    escapeHtml(admStr),
    escapeHtml(pronoun),
    escapeHtml(school.name),
  );
  const classText = student.class_name
    ? `${student.class_name}${student.section ? ` – ${student.section}` : ""}`
    : "—";
  const rows: [string, string][] = [
    ["Student name", student.name],
    ["Roll number", rollStr],
    ["Admission no.", admStr],
    ["Class & section", classText],
    ["Date of birth", fmt(student.dob)],
    ["Date of admission", fmt(student.admitted_on)],
    ["Academic session", school.session ?? "—"],
  ];
  if (opts.type === "TRANSFER") {
    rows.push(["School dues status", "Cleared / Nil"]);
  }

  const body = `
    <div class="frame">
      <header>
        ${school.logoUrl ? `<img src="${escapeHtml(school.logoUrl)}" alt="" />` : ""}
        <h1>${escapeHtml(school.name)}</h1>
        <p>${escapeHtml([school.address, school.phone, school.email].filter(Boolean).join(" · "))}</p>
      </header>
      <div class="meta">
        <span>Certificate No.: <b>${escapeHtml(opts.serial ?? "—")}</b></span>
        <span>Date: <b>${escapeHtml(fmt(opts.issuedOn))}</b></span>
      </div>
      <h2>${escapeHtml(opts.typeLabel)}</h2>
      <p class="body">${text}</p>
      <table>${rows
        .map(([k, v]) => `<tr><td class="k">${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`)
        .join("")}</table>
      <div class="spacer"></div>
      <footer>
        <div class="sign">${escapeHtml(opts.issuedBy || "Prepared by")}<br /><small>Issued by</small></div>
        <div class="seal">School Seal</div>
        <div class="sign">${escapeHtml(school.principal || "Principal")}<br /><small>Principal</small></div>
      </footer>
    </div>`;

  printHtml(`${opts.typeLabel} – ${student.name}`, body, CSS);
}
