import { ArrowRight, LogIn, ShieldCheck, Smartphone, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import heroPhones from "../assets/hero-phones.webp";
import { Eyebrow, LoginLink, buttonStyles } from "./primitives";

const HIGHLIGHTS = [
  { icon: Users, label: "8+ role-based portals" },
  { icon: Smartphone, label: "Built mobile-first" },
  { icon: ShieldCheck, label: "Secure, per-school data" },
];

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pb-20 pt-32 sm:pt-36 lg:pb-28 lg:pt-40">
      {/* backdrop */}
      <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,#000_30%,transparent_75%)]" />
      <div className="pointer-events-none absolute -left-40 top-10 h-[420px] w-[420px] rounded-full bg-[#5F9AF8]/25 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 top-40 h-[480px] w-[480px] rounded-full bg-[#8FB8FB]/30 blur-3xl" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:px-8">
        {/* copy */}
        <div className="text-center lg:text-left">
          <Eyebrow>All-in-one school ERP · Web &amp; Mobile</Eyebrow>
          <h1 className="font-display mt-6 text-[2.5rem] font-extrabold leading-[1.08] text-[#141C3A] sm:text-5xl lg:text-[3.6rem]">
            Run your entire school from <span className="text-gradient">one smart app.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-[#5b6685] lg:mx-0">
            EduNex brings admissions, attendance, fees, exams, homework, library, transport and payroll
            together — with a dedicated dashboard for admins, teachers, staff, parents and students.
          </p>

          <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <a href="#demo" className={cn(buttonStyles.primary, "w-full px-7 py-4 text-base sm:w-auto")}>
              Book a free demo <ArrowRight className="h-5 w-5" />
            </a>
            <LoginLink className={cn(buttonStyles.outline, "w-full px-7 py-4 text-base sm:w-auto")}>
              <LogIn className="h-5 w-5" /> Login to EduNex
            </LoginLink>
          </div>

          <ul className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-3 lg:justify-start">
            {HIGHLIGHTS.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2 text-sm font-medium text-[#3c4766]">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-white text-[#2F5FC4] shadow-sm ring-1 ring-[#5F9AF8]/15">
                  <Icon className="h-4 w-4" />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>

        {/* phones */}
        <div className="relative order-first mx-auto w-full max-w-[620px] lg:order-none lg:pb-10 lg:pt-12">
          <div className="absolute left-1/2 top-1/2 h-[380px] w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-[#8FB8FB] to-[#2F5FC4] opacity-30 blur-2xl" />

          <img
            src={heroPhones}
            alt="EduNex transport, student and teacher dashboards on three phones"
            width={1033}
            height={813}
            fetchPriority="high"
            className="animate-float relative z-10 h-auto w-full drop-shadow-[0_40px_50px_rgba(20,28,58,0.35)]"
          />
        </div>
      </div>

      {/* wave echoing the app's header */}
      <svg
        className="pointer-events-none absolute inset-x-0 bottom-0 h-16 w-full text-white"
        viewBox="0 0 1440 80"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          fill="currentColor"
          d="M0,48 C180,80 360,16 540,32 C720,48 900,80 1080,56 C1260,32 1350,40 1440,48 L1440,80 L0,80 Z"
        />
      </svg>
    </section>
  );
}

