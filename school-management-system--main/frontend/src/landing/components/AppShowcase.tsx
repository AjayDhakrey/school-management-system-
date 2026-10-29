import { useEffect, useState } from "react";
import { ArrowRight, Check, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { PORTALS } from "../landing-data";
import { LoginLink, Reveal, SectionHeading, buttonStyles } from "./primitives";

// Mockups that show only the top of the phone — faded out at the bottom edge.
const CROPPED_SHOTS = new Set(["transport", "teacher", "student"]);

export function AppShowcase() {
  const [active, setActive] = useState(0);
  const [autoplay, setAutoplay] = useState(true);
  const portal = PORTALS[active] ?? PORTALS[0]!;

  useEffect(() => {
    if (!autoplay) return;
    const t = window.setInterval(() => setActive((i) => (i + 1) % PORTALS.length), 6000);
    return () => window.clearInterval(t);
  }, [autoplay]);

  function select(i: number) {
    setAutoplay(false);
    setActive(i);
  }

  return (
    <section
      id="apps"
      className="relative overflow-hidden bg-[#0F1733] py-20 text-white lg:py-28"
    >
      <div className="pointer-events-none absolute -left-40 top-0 h-[500px] w-[500px] rounded-full bg-[#2F5FC4]/40 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 bottom-0 h-[500px] w-[500px] rounded-full bg-[#5F9AF8]/25 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          light
          eyebrow="App tour"
          title="See EduNex through every user's eyes"
          text="Each role logs in to a home screen built for its own job. Pick a portal to explore the real app."
        />

        <Reveal className="mt-12">
          <div
            role="tablist"
            aria-label="EduNex portals"
            className="mx-auto flex max-w-full gap-2 overflow-x-auto rounded-full bg-white/5 p-1.5 ring-1 ring-white/10 [scrollbar-width:none] sm:w-fit"
          >
            {PORTALS.map((p, i) => (
              <button
                key={p.id}
                role="tab"
                id={`tab-${p.id}`}
                aria-selected={i === active}
                aria-controls={`panel-${p.id}`}
                onClick={() => select(i)}
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-semibold transition-all",
                  i === active
                    ? "bg-gradient-to-r from-[#5F9AF8] to-[#2F5FC4] text-white shadow-lg"
                    : "text-white/65 hover:bg-white/10 hover:text-white",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </Reveal>

        <div
          key={portal.id}
          role="tabpanel"
          id={`panel-${portal.id}`}
          aria-labelledby={`tab-${portal.id}`}
          className="animate-swap mt-12 grid items-center gap-12 lg:grid-cols-2"
        >
          <div className="order-2 text-center lg:order-1 lg:text-left">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#A9CBFF]">
              {portal.label} portal
            </p>
            <h3 className="font-display mt-3 text-3xl font-bold leading-tight sm:text-4xl">{portal.title}</h3>
            <p className="mx-auto mt-4 max-w-lg text-lg leading-relaxed text-white/70 lg:mx-0">{portal.text}</p>
            <ul className="mx-auto mt-7 grid max-w-md gap-3 text-left lg:mx-0">
              {portal.points.map((pt) => (
                <li key={pt} className="flex items-start gap-3 text-white/85">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#5F9AF8]/20 text-[#A9CBFF]">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  {pt}
                </li>
              ))}
            </ul>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
              <LoginLink className={cn(buttonStyles.light, "px-6 py-3.5")}>
                <LogIn className="h-4 w-4" /> Open the app
              </LoginLink>
              <a href="#demo" className={cn(buttonStyles.ghostLight, "px-6 py-3.5")}>
                Get a guided demo <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div className="relative order-1 mx-auto flex h-[460px] w-full max-w-[420px] items-start justify-center sm:h-[560px] lg:order-2">
            <div className="absolute inset-x-8 top-10 bottom-10 rounded-[48px] bg-gradient-to-b from-[#5F9AF8]/35 to-transparent blur-2xl" />
            <img
              src={portal.image}
              alt={`EduNex ${portal.label} screen`}
              className={cn(
                "relative max-h-full drop-shadow-[0_40px_60px_rgba(0,0,0,0.5)]",
                CROPPED_SHOTS.has(portal.id) ? "fade-bottom w-full object-contain object-top" : "h-full w-auto object-contain",
              )}
            />
          </div>
        </div>

        {/* progress dots */}
        <div className="mt-10 flex justify-center gap-2" aria-hidden>
          {PORTALS.map((p, i) => (
            <span
              key={p.id}
              className={cn("h-1.5 rounded-full transition-all", i === active ? "w-8 bg-[#5F9AF8]" : "w-1.5 bg-white/25")}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
