import { ArrowRight, LogIn, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { BRAND, FAQS, NAV_LINKS } from "../landing-data";
import { LoginLink, Logo, Reveal, SectionHeading, buttonStyles } from "./primitives";

export function Faq() {
  return (
    <section id="faq" className="bg-[#F5F8FE] py-20 lg:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <SectionHeading eyebrow="FAQ" title="Questions schools ask us" />
        <div className="mt-12 space-y-4">
          {FAQS.map((f, i) => (
            <Reveal key={f.q} delay={i * 60}>
              <details className="group rounded-3xl bg-white p-6 shadow-[0_16px_40px_-30px_rgba(20,28,58,0.4)] ring-1 ring-[#5F9AF8]/10 open:ring-[#5F9AF8]/30">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left">
                  <span className="font-display text-base font-semibold text-[#141C3A] sm:text-lg">{f.q}</span>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#5F9AF8]/10 text-[#2F5FC4] transition-transform duration-300 group-open:rotate-45">
                    <Plus className="h-4 w-4" />
                  </span>
                </summary>
                <p className="mt-4 pr-12 leading-relaxed text-[#5b6685]">{f.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="bg-[#F5F8FE] pb-20 lg:pb-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="relative overflow-hidden rounded-[36px] bg-[#0F1733] px-6 py-14 text-center text-white sm:px-12 sm:py-16">
            <div className="bg-grid pointer-events-none absolute inset-0 opacity-40" />
            <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-[600px] -translate-x-1/2 rounded-full bg-[#5F9AF8]/40 blur-3xl" />
            <div className="relative">
              <h2 className="font-display mx-auto max-w-2xl text-3xl font-bold leading-tight sm:text-4xl">
                Ready to make your school paperless?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-white/70">
                See EduNex with your own classes and fee structure — or log in if your school is already on board.
              </p>
              <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
                <a href="#demo" className={cn(buttonStyles.primary, "px-7 py-4")}>
                  Book a free demo <ArrowRight className="h-5 w-5" />
                </a>
                <LoginLink className={cn(buttonStyles.ghostLight, "px-7 py-4")}>
                  <LogIn className="h-5 w-5" /> Login
                </LoginLink>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-[#5F9AF8]/10 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-8 px-4 py-10 sm:px-6 md:flex-row lg:px-8">
        <Logo />
        <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-medium text-[#5b6685]">
          {NAV_LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="hover:text-[#2F5FC4]">
                {l.label}
              </a>
            </li>
          ))}
          <li>
            <a href="#demo" className="hover:text-[#2F5FC4]">
              Book a demo
            </a>
          </li>
          <li>
            <LoginLink className="hover:text-[#2F5FC4]">Login</LoginLink>
          </li>
        </ul>
      </div>
      <p className="border-t border-[#5F9AF8]/10 py-5 text-center text-xs text-[#8a93ad]">
        © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
      </p>
    </footer>
  );
}
