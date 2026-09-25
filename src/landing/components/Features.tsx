import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { FEATURES, ROLES, ROLE_META } from "../landing-data";
import { Reveal, SectionHeading } from "./primitives";

export function RoleStrip() {
  const half = Math.ceil(ROLES.length / 2);
  const rows = [ROLES, [...ROLES.slice(half), ...ROLES.slice(0, half)]];

  return (
    <section aria-label="Who uses EduNex" className="relative overflow-hidden bg-white py-12 sm:py-16 lg:py-20">
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-64 -translate-y-1/2 bg-gradient-to-r from-[#EAF2FF] via-[#F4F8FF] to-[#EAF2FF]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-56 w-[60%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#5F9AF8]/15 blur-3xl" />

      <div className="relative mx-auto max-w-3xl px-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#5F9AF8]">One platform</p>
        <h2 className="font-display mt-3 text-[1.35rem] font-extrabold leading-snug text-[#141C3A] [text-wrap:balance] sm:text-3xl">
          A dedicated portal for <span className="text-gradient">every role</span> in your school
        </h2>
      </div>

      <div className="group relative mt-8 grid gap-3 [mask-image:linear-gradient(90deg,transparent,#000_4%,#000_96%,transparent)] sm:mt-10 sm:gap-4 sm:[mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
        {rows.map((row, r) => (
          <ul
            key={r}
            className={cn(
              "flex w-max group-hover:[animation-play-state:paused]",
              r === 0 ? "animate-marquee" : "animate-marquee-reverse",
            )}
          >
            {[...row, ...row].map((role, i) => {
              const meta = ROLE_META[role];
              const Icon = meta?.icon ?? Users;
              return (
                <li
                  key={`${role}-${i}`}
                  aria-hidden={i >= row.length || r > 0}
                  className="mr-3 flex items-center gap-2.5 whitespace-nowrap rounded-xl border border-white bg-white/80 py-2 pl-2 pr-4 sm:mr-4 sm:gap-3 sm:rounded-2xl sm:py-2.5 sm:pl-2.5 sm:pr-5 shadow-[0_10px_30px_-18px_rgba(20,28,58,0.35)] ring-1 ring-[#5F9AF8]/10 backdrop-blur transition-transform duration-300 hover:-translate-y-0.5"
                >
                  <span
                    className={cn(
                      "grid h-8 w-8 shrink-0 place-items-center rounded-lg sm:h-10 sm:w-10 sm:rounded-xl bg-gradient-to-br text-white shadow-md",
                      meta?.tone ?? "from-[#5F9AF8] to-[#2F5FC4]",
                    )}
                  >
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                  </span>
                  <span className="leading-tight">
                    <span className="block text-[13px] font-bold text-[#141C3A] sm:text-sm">{role}</span>
                    {meta && <span className="block text-[11px] text-[#5b6685] sm:text-xs">{meta.text}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        ))}
      </div>
    </section>
  );
}

export function Features() {
  return (
    <section id="features" className="relative bg-white py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Features"
          title={
            <>
              Every department. <span className="text-gradient">One connected system.</span>
            </>
          }
          text="Replace registers, spreadsheets and scattered WhatsApp groups with modules that share the same student, class and staff data."
        />

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 4) * 70}>
              <article className="group flex h-full gap-4 rounded-3xl bg-[#F8FAFE] p-5 sm:block sm:p-6 ring-1 ring-[#5F9AF8]/10 transition-all duration-300 hover:-translate-y-1.5 hover:bg-white hover:shadow-[0_24px_50px_-24px_rgba(47,95,196,0.45)] hover:ring-[#5F9AF8]/30">
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white sm:h-16 sm:w-16 shadow-[0_8px_20px_-10px_rgba(20,28,58,0.25)] transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3">
                  <img src={f.icon} alt="" className="h-11 w-11 object-contain" loading="lazy" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold text-[#141C3A] sm:mt-5">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[#5b6685] sm:mt-2">{f.text}</p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
