import { escapeHtml, printHtml } from "@/lib/print";
import type { SchoolBranding } from "@/hooks/use-school-branding";
import type { TimedPeriod } from "@/lib/school-timings";

/** What one cell of a printed timetable shows. */
export type PrintCell = { subject: string; lines: string[] } | null;

/** One printed page: a class's or a teacher's week. */
export type TimetablePage = {
  title: string;
  subtitle?: string;
  cell: (day: string, period: number) => PrintCell;
};

const CSS = `
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; margin: 0; font-size: 11px; }
  .page { break-after: page; }
  .page:last-child { break-after: auto; }
  header { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px;
    border-bottom: 2px solid #1e3a8a; padding-bottom: 8px; margin-bottom: 10px; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand img { height: 42px; width: 42px; object-fit: contain; }
  h1 { font-size: 18px; margin: 0 0 2px; color: #1e3a8a; }
  header p { margin: 0; color: #475569; line-height: 1.45; }
  .title { text-align: right; }
  h2 { font-size: 16px; margin: 0 0 2px; text-transform: uppercase; letter-spacing: .05em; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border: 1px solid #cbd5e1; padding: 6px; vertical-align: top; }
  thead th { background: #eef2ff; color: #1e3a8a; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
  th.period { width: 95px; text-align: left; background: #f8fafc; }
  th.period b { display: block; font-size: 11.5px; color: #0f172a; }
  th.period span { font-size: 9.5px; color: #64748b; font-weight: 400; }
  td { height: 52px; }
  td b { display: block; font-size: 11.5px; }
  td small { display: block; font-size: 9.5px; color: #475569; margin-top: 1px; }
  td.break { background: #f1f5f9; text-align: center; color: #64748b; font-style: italic; vertical-align: middle; }
  td.empty { color: #cbd5e1; text-align: center; vertical-align: middle; }
  tr { break-inside: avoid; }
  footer { display: flex; justify-content: space-between; margin-top: 8px; color: #64748b; font-size: 9px; }
`;

/** Prints one or more weekly timetables, one per landscape A4 page. */
export function printTimetables(
  school: SchoolBranding,
  pages: TimetablePage[],
  days: string[],
  periods: TimedPeriod[],
  docTitle = "Timetable",
) {
  if (!pages.length) return;
  const printed = new Date().toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const body = pages
    .map((page) => {
      const rows = periods
        .map((p) => {
          const cells = days
            .map((day) => {
              const cell = page.cell(day, p.period);
              if (!cell) return `<td class="empty">—</td>`;
              if (cell.subject === "Break") return `<td class="break">Break</td>`;
              return `<td><b>${escapeHtml(cell.subject)}</b>${cell.lines
                .filter(Boolean)
                .map((line) => `<small>${escapeHtml(line)}</small>`)
                .join("")}</td>`;
            })
            .join("");
          return `<tr><th class="period"><b>Period ${p.period}</b><span>${escapeHtml(p.time)}</span></th>${cells}</tr>`;
        })
        .join("");
      return `<section class="page">
        <header>
          <div class="brand">
            ${school.logoUrl ? `<img src="${escapeHtml(school.logoUrl)}" alt="" />` : ""}
            <div>
              <h1>${escapeHtml(school.name)}</h1>
              <p>${escapeHtml([school.address, school.phone].filter(Boolean).join(" · "))}</p>
            </div>
          </div>
          <div class="title">
            <h2>${escapeHtml(page.title)}</h2>
            <p>${escapeHtml([page.subtitle, school.session ? `Session ${school.session}` : ""].filter(Boolean).join(" · "))}</p>
          </div>
        </header>
        <table>
          <thead><tr><th class="period">Period</th>${days.map((d) => `<th>${escapeHtml(d)}</th>`).join("")}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <footer><span>Printed ${escapeHtml(printed)}</span><span>${escapeHtml(school.shortName ?? "")}</span></footer>
      </section>`;
    })
    .join("");

  printHtml(docTitle, body, CSS);
}
