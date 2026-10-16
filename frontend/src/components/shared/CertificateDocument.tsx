import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, Printer, Award, FileCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SchoolBranding } from "@/hooks/use-school-branding";
import type { ApiStudent } from "@/hooks/useApi";
import { downloadElementAsPdf } from "@/lib/pdf";

export interface CertificateDocProps {
  serial: string;
  type: string; // "BONAFIDE" | "TRANSFER" | "CHARACTER"
  typeLabel: string;
  student: {
    name: string;
    roll?: number | null | undefined;
    admission_no?: string | null | undefined;
    class_name?: string | null | undefined;
    section?: string | null | undefined;
    dob?: string | null | undefined;
    admitted_on?: string | null | undefined;
    gender?: string | null | undefined;
  };
  issuedOn: string;
  issuedBy?: string | null | undefined;
  school: SchoolBranding;
}

function formatDate(iso: string | null | undefined): string {
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
}

export function CertificateDocument({
  serial,
  type,
  typeLabel,
  student,
  issuedOn,
  issuedBy,
  school,
}: CertificateDocProps) {
  const [downloading, setDownloading] = useState(false);
  const certRef = useRef<HTMLDivElement>(null);

  const studentName = student.name || "Student Name";
  const rollNo = student.roll != null ? String(student.roll) : "—";
  const admissionNo = student.admission_no || "—";
  const classSection = student.class_name
    ? `${student.class_name}${student.section ? ` – Section ${student.section}` : ""}`
    : "—";
  const session = school.session || "2026–2027";
  const dobFormatted = formatDate(student.dob);
  const admittedOnFormatted = formatDate(student.admitted_on);

  const gender = (student.gender ?? "").toLowerCase();
  const pronounHeShe = gender.startsWith("f") ? "She" : gender.startsWith("m") ? "He" : "They";
  const pronounHisHer = gender.startsWith("f") ? "Her" : gender.startsWith("m") ? "His" : "Their";
  const pronounHimHer = gender.startsWith("f") ? "her" : gender.startsWith("m") ? "him" : "them";
  const verbIsAre = pronounHeShe === "They" ? "are" : "is";
  const verbHasHave = pronounHeShe === "They" ? "have" : "has";

  async function handleDownloadPdf() {
    if (!certRef.current) return;
    setDownloading(true);
    try {
      const filename = `${typeLabel.replace(/\s+/g, "_")}_${studentName.replace(/\s+/g, "_")}_Roll_${rollNo}`;
      await downloadElementAsPdf(certRef.current, filename);
      toast.success("Certificate downloaded as PDF");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to download PDF");
    } finally {
      setDownloading(false);
    }
  }

  // Body text based on certificate type
  let certificateParagraph = "";
  if (type === "TRANSFER") {
    certificateParagraph = `This is to certify that ${studentName}, bearing Roll No. ${rollNo} and Admission No. ${admissionNo}, was a bona fide student of ${school.name || "this school"} in Class ${classSection} during the academic session ${session}. ${pronounHeShe} ${verbHasHave} cleared all school dues, fee installments, and library books. ${pronounHeShe} ${verbIsAre} granted this Transfer Certificate on leaving the school. ${pronounHisHer} conduct and character have been good throughout ${pronounHisHer.toLowerCase()} study here. We wish ${pronounHimHer} every success in future academic pursuits.`;
  } else if (type === "CHARACTER") {
    certificateParagraph = `This is to certify that ${studentName}, bearing Roll No. ${rollNo} and Admission No. ${admissionNo}, has been a student of ${school.name || "this school"} in Class ${classSection} during the academic session ${session}. During ${pronounHisHer.toLowerCase()} period of study at this institution, ${pronounHisHer.toLowerCase()} conduct, moral character, and discipline have been found to be exemplary. To the best of our knowledge, ${pronounHeShe.toLowerCase()} ${verbHasHave} not taken part in any activity adverse to the school or society. We wish ${pronounHimHer} a bright and prosperous future.`;
  } else {
    // BONAFIDE or default
    certificateParagraph = `This is to certify that ${studentName}, bearing Roll No. ${rollNo} and Admission No. ${admissionNo}, is a bona fide student of ${school.name || "this school"}, currently studying in Class ${classSection} during the academic session ${session}. According to the school Admission Register, ${pronounHisHer.toLowerCase()} Date of Birth is ${dobFormatted}. To the best of our knowledge, ${pronounHeShe.toLowerCase()} bears a good moral character. This certificate is issued upon the request of the parent/guardian for official and academic purposes.`;
  }

  return (
    <div className="flex flex-col">
      {/* Printable Certificate Sheet */}
      <div
        ref={certRef}
        className="relative mx-auto w-full max-w-2xl bg-white p-6 sm:p-8 text-slate-900 border-[6px] border-double border-indigo-950 shadow-sm print:m-0 print:w-full print:max-w-none print:border-[4px] print:p-6 print:shadow-none"
        style={{ minHeight: "260mm", display: "flex", flexDirection: "column" }}
      >
        {/* Decorative corner ornaments */}
        <div className="absolute top-2 left-2 text-indigo-900/30 print:text-indigo-900/40">
          <Award className="h-6 w-6" />
        </div>
        <div className="absolute top-2 right-2 text-indigo-900/30 print:text-indigo-900/40">
          <FileCheck className="h-6 w-6" />
        </div>

        {/* School Header */}
        <header className="border-b-2 border-indigo-950 pb-4 text-center">
          {school.logoUrl ? (
            <img
              src={school.logoUrl}
              alt={school.name}
              className="mx-auto mb-2 h-16 w-auto max-w-[180px] object-contain"
            />
          ) : (
            <div className="mx-auto mb-2 grid h-14 w-14 place-items-center rounded-full border-2 border-indigo-950 bg-indigo-50 font-display text-xl font-bold text-indigo-950">
              {(school.shortName || school.name || "SCH").slice(0, 3).toUpperCase()}
            </div>
          )}
          <h1 className="font-serif text-2xl font-bold tracking-wide uppercase text-indigo-950 sm:text-3xl">
            {school.name || "School Name"}
          </h1>
          {school.tagline && (
            <p className="mt-0.5 text-xs italic text-slate-600">{school.tagline}</p>
          )}
          <p className="mt-1 text-xs text-slate-600">
            {[school.address, school.phone, school.email].filter(Boolean).join(" · ")}
          </p>
        </header>

        {/* Certificate Meta Row */}
        <div className="mt-3 flex items-center justify-between text-xs text-slate-700">
          <p>
            <span className="font-semibold text-slate-900">Certificate No.:</span>{" "}
            <span className="font-mono font-bold text-indigo-950">{serial}</span>
          </p>
          <p>
            <span className="font-semibold text-slate-900">Date of Issue:</span>{" "}
            <span className="font-semibold">{formatDate(issuedOn)}</span>
          </p>
        </div>

        {/* Certificate Title */}
        <div className="my-6 text-center">
          <span className="inline-block border-b-2 border-t-2 border-indigo-950 px-6 py-1.5 font-serif text-xl font-bold tracking-[0.16em] uppercase text-indigo-950 sm:text-2xl">
            {typeLabel}
          </span>
        </div>

        {/* Certificate Paragraph */}
        <div className="my-2 font-serif text-base leading-relaxed text-justify text-slate-800 sm:text-[17px]">
          <p className="indent-8 leading-8">
            {certificateParagraph
              .split(
                new RegExp(
                  `(${escapeRegExp(studentName)}|${escapeRegExp(rollNo)}|${escapeRegExp(admissionNo)})`,
                  "g",
                ),
              )
              .map((part, i) =>
                part === studentName || (rollNo !== "—" && part === rollNo) || (admissionNo !== "—" && part === admissionNo) ? (
                  <strong key={i} className="font-bold text-slate-950 underline underline-offset-4 decoration-indigo-900/60">
                    {part}
                  </strong>
                ) : (
                  part
                ),
              )}
          </p>
        </div>

        {/* Student Details Summary Table */}
        <div className="mt-6 mb-4">
          <table className="w-full border-collapse text-xs sm:text-sm">
            <tbody>
              <tr className="border border-slate-300">
                <td className="w-1/3 bg-slate-100 p-2 font-semibold text-slate-700 border-r border-slate-300">
                  Student Name
                </td>
                <td className="p-2 font-bold text-slate-900">{studentName}</td>
              </tr>
              <tr className="border border-slate-300">
                <td className="w-1/3 bg-slate-100 p-2 font-semibold text-slate-700 border-r border-slate-300">
                  Roll Number
                </td>
                <td className="p-2 font-bold font-mono text-indigo-950">{rollNo}</td>
              </tr>
              <tr className="border border-slate-300">
                <td className="w-1/3 bg-slate-100 p-2 font-semibold text-slate-700 border-r border-slate-300">
                  Admission Number
                </td>
                <td className="p-2 font-medium text-slate-800">{admissionNo}</td>
              </tr>
              <tr className="border border-slate-300">
                <td className="w-1/3 bg-slate-100 p-2 font-semibold text-slate-700 border-r border-slate-300">
                  Class & Section
                </td>
                <td className="p-2 font-medium text-slate-800">{classSection}</td>
              </tr>
              <tr className="border border-slate-300">
                <td className="w-1/3 bg-slate-100 p-2 font-semibold text-slate-700 border-r border-slate-300">
                  Date of Birth
                </td>
                <td className="p-2 font-medium text-slate-800">{dobFormatted}</td>
              </tr>
              <tr className="border border-slate-300">
                <td className="w-1/3 bg-slate-100 p-2 font-semibold text-slate-700 border-r border-slate-300">
                  Date of Admission
                </td>
                <td className="p-2 font-medium text-slate-800">{admittedOnFormatted}</td>
              </tr>
              <tr className="border border-slate-300">
                <td className="w-1/3 bg-slate-100 p-2 font-semibold text-slate-700 border-r border-slate-300">
                  Academic Session
                </td>
                <td className="p-2 font-medium text-slate-800">{session}</td>
              </tr>
              {type === "TRANSFER" && (
                <tr className="border border-slate-300">
                  <td className="w-1/3 bg-slate-100 p-2 font-semibold text-slate-700 border-r border-slate-300">
                    School Dues Status
                  </td>
                  <td className="p-2 font-semibold text-emerald-700">Cleared / Nil Dues</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Spacer to push signatures to bottom of page */}
        <div className="flex-1" style={{ minHeight: "40px" }} />

        {/* Signatures & Seal Footer */}
        <footer className="mt-8 flex items-end justify-between text-xs text-slate-700">
          <div className="w-40 text-center">
            <div className="border-t border-slate-700 pt-1.5 font-semibold text-slate-900">
              {issuedBy || "Prepared By"}
            </div>
            <p className="text-[11px] text-slate-500">Class Teacher / Clerk</p>
          </div>

          <div className="flex flex-col items-center">
            <div className="grid h-20 w-20 place-items-center rounded-full border-2 border-dashed border-slate-400 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Official<br />Seal
            </div>
          </div>

          <div className="w-40 text-center">
            <div className="border-t border-slate-700 pt-1.5 font-semibold text-slate-900">
              {school.principal || "Principal"}
            </div>
            <p className="text-[11px] text-slate-500">Head of Institution</p>
          </div>
        </footer>
      </div>

      {/* Screen action buttons (hidden when printing) */}
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2.5 print-hide print:hidden">
        <Button
          variant="outline"
          className="gap-2"
          onClick={handleDownloadPdf}
          disabled={downloading}
        >
          {downloading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {downloading ? "Preparing PDF…" : "Download PDF"}
        </Button>
        <Button
          className="gap-2 bg-indigo-900 hover:bg-indigo-950 text-white"
          onClick={() => window.print()}
        >
          <Printer className="h-4 w-4" /> Print Certificate
        </Button>
      </div>
    </div>
  );
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
