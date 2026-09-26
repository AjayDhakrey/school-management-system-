import { useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Loader2,
  Lock,
  LogIn,
  Mail,
  MapPin,
  MessageSquareText,
  Phone,
  ShieldCheck,
  User,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { CONTACT_ROLES, STUDENT_BANDS } from "../landing-data";
import { LoginLink, Reveal, buttonStyles } from "./primitives";

const NEXT_STEPS = [
  { title: "We confirm your slot", text: "Our team reaches out within one working day." },
  { title: "Live 30-minute walkthrough", text: "Every portal, shown with sample school data." },
  { title: "Tailored setup plan", text: "Data import, training and a clear go-live date." },
];

const ASSURANCES = [
  { icon: ShieldCheck, label: "No obligation" },
  { icon: Clock3, label: "30-min session" },
  { icon: Lock, label: "Data kept private" },
];

const EMPTY = {
  name: "",
  school: "",
  email: "",
  phone: "",
  role: "",
  students: "",
  city: "",
  date: "",
  message: "",
};

const inputCls =
  "w-full rounded-xl border border-[#DCE4F2] bg-white py-3 pl-11 pr-4 text-[15px] text-[#141C3A] shadow-[0_1px_2px_rgba(20,28,58,0.04)] outline-none transition placeholder:text-[#9aa3bb] hover:border-[#C3D2EC] focus:border-[#5F9AF8] focus:ring-4 focus:ring-[#5F9AF8]/15";

export function DemoForm() {
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const notes = [
      form.role && `Role: ${form.role}`,
      form.students && `Students: ${form.students}`,
      form.city && `City: ${form.city}`,
      form.date && `Preferred demo date: ${form.date}`,
      form.message && `\n${form.message}`,
    ]
      .filter(Boolean)
      .join("\n");

    const { error } = await supabase.rpc("submit_demo_request", {
      p_school_name: form.school,
      p_contact_name: form.name,
      p_email: form.email,
      p_phone: form.phone,
      p_notes: notes || null,
    });
    setSubmitting(false);

    if (error) {
      toast.error(
        error.code === "PGRST202"
          ? "Demo booking is not available right now. Please try again later."
          : error.message || "Could not send your request. Please try again.",
      );
      return;
    }
    setDone(true);
    setForm(EMPTY);
  }

  return (
    <section id="demo" className="relative overflow-hidden bg-[#F5F8FE] py-20 lg:py-28">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[400px] w-[800px] -translate-x-1/2 rounded-full bg-[#5F9AF8]/15 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="grid overflow-hidden rounded-[28px] bg-white shadow-[0_50px_100px_-45px_rgba(20,28,58,0.45)] ring-1 ring-[#141C3A]/[0.06] lg:grid-cols-[0.85fr_1.15fr]">
            {/* left: pitch */}
            <div className="relative overflow-hidden bg-[#0F1B3D] p-8 text-white sm:p-10 lg:p-12">
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(ellipse_at_top_left,#000_10%,transparent_70%)]" />
              <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#5F9AF8]/35 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-28 -left-20 h-72 w-72 rounded-full bg-[#14B8A6]/20 blur-3xl" />

              <div className="relative flex h-full flex-col">
                <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#BFD5FF] ring-1 ring-white/15">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Free product demo
                </span>
                <h2 className="font-display mt-6 text-3xl font-bold leading-tight sm:text-[2.4rem]">
                  See EduNex running <span className="text-[#8FB8FB]">your school.</span>
                </h2>
                <p className="mt-4 leading-relaxed text-white/70">
                  Tell us a little about your school and we'll show you exactly how EduNex fits your day.
                </p>

                <p className="mt-10 text-xs font-semibold uppercase tracking-[0.16em] text-white/50">What happens next</p>
                <ol className="relative mt-5 space-y-6">
                  <span aria-hidden className="absolute bottom-3 left-[15px] top-3 w-px bg-white/15" />
                  {NEXT_STEPS.map((s, i) => (
                    <li key={s.title} className="relative flex gap-4">
                      <span className="font-display relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#1E3F9A] text-sm font-bold text-white ring-4 ring-[#0F1B3D]">
                        {i + 1}
                      </span>
                      <span>
                        <span className="block font-semibold">{s.title}</span>
                        <span className="mt-0.5 block text-sm text-white/60">{s.text}</span>
                      </span>
                    </li>
                  ))}
                </ol>

                <div className="mt-10 grid grid-cols-3 gap-2 border-t border-white/10 pt-6 lg:mt-auto">
                  {ASSURANCES.map(({ icon: Icon, label }) => (
                    <span key={label} className="flex flex-col items-start gap-2 text-xs font-medium text-white/75">
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-[#8FB8FB]">
                        <Icon className="h-4 w-4" />
                      </span>
                      {label}
                    </span>
                  ))}
                </div>

                <p className="mt-8 text-sm text-white/60">
                  Already an EduNex school?{" "}
                  <LoginLink className="font-semibold text-white underline decoration-white/40 underline-offset-4 hover:decoration-white">
                    Log in here
                  </LoginLink>
                </p>
              </div>
            </div>

            {/* right: form */}
            <div className="p-7 sm:p-10 lg:p-12">
              {done ? (
                <div className="flex h-full flex-col items-center justify-center py-10 text-center">
                  <span className="grid h-20 w-20 place-items-center rounded-full bg-emerald-50 text-emerald-500 ring-8 ring-emerald-50/60">
                    <CheckCircle2 className="h-10 w-10" />
                  </span>
                  <h3 className="font-display mt-6 text-2xl font-bold text-[#141C3A]">Request received!</h3>
                  <p className="mt-3 max-w-sm text-[#5b6685]">
                    Thank you. Our team will contact you within one working day to confirm your demo slot.
                  </p>
                  <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    <button type="button" onClick={() => setDone(false)} className={cn(buttonStyles.outline, "px-6 py-3")}>
                      Send another request
                    </button>
                    <LoginLink className={cn(buttonStyles.primary, "px-6 py-3")}>
                      <LogIn className="h-4 w-4" /> Go to login
                    </LoginLink>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit}>
                  <div className="flex flex-wrap items-end justify-between gap-2 border-b border-[#EEF2F9] pb-6">
                    <div>
                      <h3 className="font-display text-2xl font-bold text-[#141C3A]">Book your demo</h3>
                      <p className="mt-1 text-sm text-[#5b6685]">Takes less than a minute to fill in.</p>
                    </div>
                    <p className="text-xs text-[#8a93ad]">
                      <span className="text-[#E5484D]">*</span> Required
                    </p>
                  </div>

                  <FieldGroup title="About you">
                    <Field label="Full name" required id="demo-name" icon={User}>
                      <input id="demo-name" required minLength={2} maxLength={120} autoComplete="name"
                        value={form.name} onChange={set("name")} placeholder="Anita Sharma" className={inputCls} />
                    </Field>
                    <Field label="Your role" id="demo-role" icon={UserCog} select>
                      <select id="demo-role" value={form.role} onChange={set("role")}
                        className={cn(inputCls, "appearance-none pr-10", !form.role && "text-[#9aa3bb]")}>
                        <option value="">Select role</option>
                        {CONTACT_ROLES.map((r) => <option key={r} className="text-[#141C3A]">{r}</option>)}
                      </select>
                    </Field>
                    <Field label="Work email" required id="demo-email" icon={Mail}>
                      <input id="demo-email" type="email" required maxLength={200} autoComplete="email"
                        value={form.email} onChange={set("email")} placeholder="you@school.edu" className={inputCls} />
                    </Field>
                    <Field label="Phone" required id="demo-phone" icon={Phone}>
                      <input id="demo-phone" type="tel" required pattern="[\d\s+\-\(\)]{7,20}" autoComplete="tel"
                        title="7–20 digits; + ( ) - and spaces allowed"
                        value={form.phone} onChange={set("phone")} placeholder="+91 98765 43210" className={inputCls} />
                    </Field>
                  </FieldGroup>

                  <FieldGroup title="About your school">
                    <Field label="School name" required id="demo-school" icon={Building2}>
                      <input id="demo-school" required minLength={2} maxLength={160} autoComplete="organization"
                        value={form.school} onChange={set("school")} placeholder="Green Valley School" className={inputCls} />
                    </Field>
                    <Field label="City" id="demo-city" icon={MapPin}>
                      <input id="demo-city" maxLength={80} autoComplete="address-level2"
                        value={form.city} onChange={set("city")} placeholder="Jaipur" className={inputCls} />
                    </Field>
                    <Field label="Number of students" id="demo-students" icon={Users} select>
                      <select id="demo-students" value={form.students} onChange={set("students")}
                        className={cn(inputCls, "appearance-none pr-10", !form.students && "text-[#9aa3bb]")}>
                        <option value="">Select range</option>
                        {STUDENT_BANDS.map((b) => <option key={b} className="text-[#141C3A]">{b}</option>)}
                      </select>
                    </Field>
                    <Field label="Preferred demo date" id="demo-date" icon={CalendarDays}>
                      <input id="demo-date" type="date" min={today} value={form.date} onChange={set("date")}
                        className={cn(inputCls, !form.date && "text-[#9aa3bb]")} />
                    </Field>
                    <Field label="Anything we should know?" id="demo-message" icon={MessageSquareText} wide>
                      <textarea id="demo-message" rows={3} maxLength={1500} value={form.message} onChange={set("message")}
                        placeholder="Modules you're interested in, current software, questions…"
                        className={cn(inputCls, "resize-none")} />
                    </Field>
                  </FieldGroup>

                  <div className="mt-8">
                    <button type="submit" disabled={submitting}
                      className={cn(buttonStyles.primary, "group w-full py-4 text-base disabled:translate-y-0 disabled:opacity-70")}>
                      {submitting && <Loader2 className="h-5 w-5 animate-spin" />}
                      {submitting ? "Sending…" : "Book my free demo"}
                      {!submitting && <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />}
                    </button>
                    <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-[#8a93ad]">
                      <Lock className="h-3.5 w-3.5" /> We only use your details to arrange your demo. No spam.
                    </p>
                  </div>
                </form>
              )}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="mt-7">
      <legend className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5F9AF8]">{title}</legend>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Field({
  label,
  id,
  icon: Icon,
  required,
  select,
  wide,
  children,
}: {
  label: string;
  id: string;
  icon: LucideIcon;
  required?: boolean;
  select?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn("grid gap-1.5", wide && "sm:col-span-2")}>
      <label htmlFor={id} className="text-sm font-semibold text-[#3c4766]">
        {label}
        {required && <span className="ml-0.5 text-[#E5484D]">*</span>}
      </label>
      <div className="relative">
        <Icon
          aria-hidden
          className={cn("pointer-events-none absolute left-4 h-4 w-4 text-[#8a93ad]", wide ? "top-3.5" : "top-1/2 -translate-y-1/2")}
        />
        {children}
        {select && (
          <ChevronDown
            aria-hidden
            className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a93ad]"
          />
        )}
      </div>
    </div>
  );
}
