import {
  ArrowRight,
  CalendarCheck2,
  DatabaseZap,
  KeyRound,
  LogIn,
  Rocket,
  ShieldCheck,
  Sun,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DAY_FLOW, ONBOARDING_STEPS, ROLE_META, SHOTS } from "../landing-data";
import { LoginLink, Reveal, SectionHeading, buttonStyles } from "./primitives";

const LOGIN_STEPS = [
  { title: "Open EduNex", text: "On your phone or computer — no app store download needed." },
  { title: "Enter your User ID & password", text: "Your school admin creates the login for each person." },
  { title: "Land on your own dashboard", text: "Admin, teacher, parent or student — you only see what's yours." },
];

// Icon + accent colour for each onboarding step, in order.
const STEP_STYLES = [
  { icon: CalendarCheck2, tone: "from-[#8FB8FB] to-[#2F5FC4]", text: "text-[#2F5FC4]" },
  { icon: DatabaseZap, tone: "from-[#C084FC] to-[#7E22CE]", text: "text-[#7E22CE]" },
  { icon: KeyRound, tone: "from-[#FDBA74] to-[#EA580C]", text: "text-[#EA580C]" },
  { icon: Rocket, tone: "from-[#5EEAD4] to-[#0F766E]", text: "text-[#0F766E]" },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="relative bg-[#F5F8FE] py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="How it works"
          title={
            <>
              Live in days, <span className="text-gradient">not months.</span>
            </>
          }
          text="We handle the setup so your team can start using EduNex right away."
        />

        {/* onboarding journey */}
        <Reveal className="relative mt-14 overflow-hidden rounded-[32px] bg-gradient-to-br from-white via-[#F7FAFF] to-[#EEF4FF] px-6 py-12 shadow-[0_40px_80px_-50px_rgba(20,28,58,0.4)] ring-1 ring-[#5F9AF8]/15 sm:px-10 lg:px-12 lg:py-16">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(95,154,248,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(95,154,248,0.08)_1px,transparent_1px)] [background-size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,#000_20%,transparent_75%)]" />
          <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[#8FB8FB]/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 -right-20 h-80 w-80 rounded-full bg-[#5EEAD4]/20 blur-3xl" />

          <ol className="relative grid gap-8 lg:grid-cols-4 lg:gap-6">
            {/* track: horizontal on desktop, vertical on mobile */}
            <span
              aria-hidden
              className="absolute left-[12.5%] right-[12.5%] top-10 hidden h-1 -translate-y-1/2 rounded-full bg-gradient-to-r from-[#5F9AF8] via-[#A855F7] via-60% to-[#14B8A6] opacity-50 lg:block"
            >
              <span className="animate-travel absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#5F9AF8] shadow-[0_0_16px_5px_rgba(95,154,248,0.55)]" />
            </span>
            <span
              aria-hidden
              className="absolute bottom-10 left-10 top-10 w-1 -translate-x-1/2 rounded-full bg-gradient-to-b from-[#5F9AF8] via-[#A855F7] to-[#14B8A6] opacity-40 lg:hidden"
            />
            <span aria-hidden className="absolute bottom-10 left-10 top-10 w-1 -translate-x-1/2 lg:hidden">
              <span className="animate-travel-y absolute left-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#5F9AF8] shadow-[0_0_16px_5px_rgba(95,154,248,0.55)]" />
            </span>

            {ONBOARDING_STEPS.map((s, i) => {
              const style = STEP_STYLES[i % STEP_STYLES.length]!;
              const Icon = style.icon;
              return (
                <li key={s.title} className="group relative flex gap-5 lg:flex-col lg:items-center lg:gap-0 lg:text-center">
                  <span className="relative z-10 grid h-20 w-20 shrink-0 place-items-center rounded-full bg-white shadow-[0_14px_30px_-14px_rgba(20,28,58,0.45)] ring-1 ring-[#5F9AF8]/15">
                    <span aria-hidden className={cn("absolute inset-2 rounded-full bg-gradient-to-br opacity-35 blur-lg transition-opacity duration-300 group-hover:opacity-70", style.tone)} />
                    <span
                      className={cn(
                        "relative grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br text-white ring-4 ring-white transition-transform duration-300 group-hover:scale-110",
                        style.tone,
                      )}
                    >
                      <Icon className="h-6 w-6" />
                    </span>
                    <span className="font-display absolute -right-1 -top-1 grid h-7 w-7 place-items-center rounded-full bg-[#141C3A] text-xs font-extrabold text-white shadow-lg ring-2 ring-white">
                      {i + 1}
                    </span>
                  </span>

                  <div className="flex-1 rounded-2xl bg-white/90 p-5 shadow-[0_18px_40px_-30px_rgba(20,28,58,0.45)] ring-1 ring-[#141C3A]/[0.06] backdrop-blur-sm transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_28px_50px_-28px_rgba(20,28,58,0.45)] lg:mt-7 lg:w-full">
                    <p className={cn("text-xs font-bold uppercase tracking-[0.16em]", style.text)}>
                      Step {String(i + 1).padStart(2, "0")}
                    </p>
                    <h3 className="font-display mt-1.5 text-lg font-bold text-[#141C3A]">{s.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-[#5b6685]">{s.text}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </Reveal>

        <div className="mt-20 grid gap-8 lg:grid-cols-2">
          {/* day timeline */}
          <Reveal className="relative overflow-hidden rounded-[32px] bg-white p-6 shadow-[0_30px_60px_-40px_rgba(20,28,58,0.45)] ring-1 ring-[#5F9AF8]/10 sm:p-10">
            <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-gradient-to-br from-[#FDE68A]/50 to-[#8FB8FB]/30 blur-3xl" />

            <div className="relative">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFF7E6] px-3 py-1 text-xs font-semibold text-[#B45309] ring-1 ring-[#F59E0B]/20">
                <Sun className="h-3.5 w-3.5" /> From first bell to last
              </span>
              <h3 className="font-display mt-4 text-2xl font-bold text-[#141C3A] sm:text-[1.7rem]">
                A school day on <span className="text-gradient">EduNex</span>
              </h3>
              <p className="mt-2 text-[#5b6685]">Every role works in the same system, so information flows on its own.</p>
            </div>

            <ol className="relative mt-8">
              <span
                aria-hidden
                className="absolute bottom-8 left-[27px] top-8 w-0.5 rounded-full bg-gradient-to-b from-[#F97316] via-[#5F9AF8] to-[#2F5FC4] opacity-40 sm:left-[111px]"
              />
              {DAY_FLOW.map((d) => {
                const meta = ROLE_META[d.role];
                const Icon = meta?.icon ?? Users;
                return (
                  <li key={d.time} className="relative flex gap-4 pb-4 last:pb-0 sm:gap-5">
                    <span className="hidden w-[64px] shrink-0 pt-6 text-right text-sm font-bold tabular-nums text-[#141C3A] sm:block">
                      {d.time}
                    </span>
                    <span
                      className={cn(
                        "relative z-10 mt-2 grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-[0_12px_24px_-10px_rgba(20,28,58,0.45)] ring-4 ring-white",
                        meta?.tone ?? "from-[#5F9AF8] to-[#2F5FC4]",
                      )}
                    >
                      <Icon className="h-6 w-6" />
                    </span>
                    <div className="min-w-0 flex-1 rounded-2xl bg-[#F7FAFF] p-4 ring-1 ring-[#5F9AF8]/10 transition-all duration-300 hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_18px_36px_-24px_rgba(20,28,58,0.45)]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[#141C3A] px-2.5 py-0.5 text-xs font-semibold text-white sm:hidden">
                          {d.time}
                        </span>
                        <span className="text-sm font-bold text-[#141C3A]">{d.role}</span>
                      </div>
                      <p className="mt-1 text-[15px] leading-relaxed text-[#3c4766]">{d.text}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Reveal>

          {/* login guide */}
          <Reveal
            delay={120}
            className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-[#6FA6FA] via-[#3F7BE8] to-[#1E3F9A] p-6 text-white shadow-[0_40px_80px_-40px_rgba(30,63,154,0.8)] sm:p-10"
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.18)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_top_right,#000_20%,transparent_70%)]" />
            <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-[#14B8A6]/30 blur-3xl" />

            <div className="relative grid h-full items-center gap-10 sm:grid-cols-[1fr_210px] xl:grid-cols-[1fr_240px]">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold ring-1 ring-white/25 backdrop-blur">
                  <KeyRound className="h-3.5 w-3.5" /> One login for everyone
                </span>
                <h3 className="font-display mt-4 text-2xl font-bold sm:text-[1.7rem]">How to log in</h3>
                <p className="mt-2 text-white/80">One secure login page for everyone in your school.</p>

                <ol className="mt-7 space-y-3">
                  {LOGIN_STEPS.map((s, i) => (
                    <li
                      key={s.title}
                      className="flex gap-4 rounded-2xl bg-white/10 p-4 ring-1 ring-white/20 backdrop-blur-md transition-colors duration-300 hover:bg-white/[0.16]"
                    >
                      <span className="font-display grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-base font-extrabold text-[#2F5FC4] shadow-[0_10px_20px_-8px_rgba(0,0,0,0.35)]">
                        {i + 1}
                      </span>
                      <span>
                        <span className="block font-semibold">{s.title}</span>
                        <span className="mt-0.5 block text-sm leading-relaxed text-white/75">{s.text}</span>
                      </span>
                    </li>
                  ))}
                </ol>

                <LoginLink className={cn(buttonStyles.light, "mt-8 px-6 py-3.5")}>
                  <LogIn className="h-4 w-4" /> Go to login <ArrowRight className="h-4 w-4" />
                </LoginLink>
              </div>

              <div className="relative mx-auto hidden sm:block">
                <div className="absolute left-1/2 top-1/2 h-[115%] w-[115%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25" />
                <div className="absolute left-1/2 top-1/2 h-[85%] w-[85%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/20 blur-2xl" />
                <img
                  src={SHOTS.login}
                  alt="EduNex login screen"
                  loading="lazy"
                  className="animate-float relative w-[210px] drop-shadow-[0_30px_40px_rgba(10,20,60,0.5)] xl:w-[240px]"
                />
                <span className="absolute -left-8 bottom-16 z-10 flex items-center gap-2 whitespace-nowrap rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-[#141C3A] shadow-[0_16px_30px_-12px_rgba(10,20,60,0.5)]">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-500 text-white">
                    <ShieldCheck className="h-4 w-4" />
                  </span>
                  Secure &amp; role-based
                </span>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
