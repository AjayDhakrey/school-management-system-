import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { BRAND } from "../landing-data";
import logoMark from "../assets/edunex-mark.webp";

/** Fades children up once they scroll into view. */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          el.classList.add("is-visible");
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={cn("reveal", className)} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <a href="#top" className="flex items-center gap-2.5" aria-label={`${BRAND.name} home`}>
      <img src={logoMark} alt="" width={48} height={48} className="h-12 w-12 object-contain" />
      <span className="leading-tight">
        <span className={cn("font-display block text-lg font-bold", light ? "text-white" : "text-[#141C3A]")}>
          {BRAND.name}
        </span>
        <span className={cn("block text-[11px] font-medium", light ? "text-white/70" : "text-[#5b6685]")}>
          {BRAND.tagline}
        </span>
      </span>
    </a>
  );
}

export function Eyebrow({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em]",
        light ? "bg-white/10 text-[#A9CBFF] ring-1 ring-white/15" : "bg-[#5F9AF8]/10 text-[#2F5FC4]",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", light ? "bg-[#A9CBFF]" : "bg-[#5F9AF8]")} />
      {children}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  text,
  light = false,
}: {
  eyebrow: string;
  title: ReactNode;
  text?: string;
  light?: boolean;
}) {
  return (
    <Reveal className="mx-auto max-w-2xl text-center">
      <Eyebrow light={light}>{eyebrow}</Eyebrow>
      <h2
        className={cn(
          "font-display mt-4 text-3xl font-bold leading-tight sm:text-4xl",
          light ? "text-white" : "text-[#141C3A]",
        )}
      >
        {title}
      </h2>
      {text && (
        <p className={cn("mt-4 text-base leading-relaxed sm:text-lg", light ? "text-white/70" : "text-[#5b6685]")}>
          {text}
        </p>
      )}
    </Reveal>
  );
}

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5F9AF8]/40";

export const buttonStyles = {
  primary: cn(
    btnBase,
    "bg-gradient-to-r from-[#5F9AF8] to-[#2F5FC4] text-white shadow-[0_14px_30px_-10px_rgba(47,95,196,0.7)] hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-10px_rgba(47,95,196,0.8)]",
  ),
  outline: cn(
    btnBase,
    "bg-white text-[#2F5FC4] ring-1 ring-[#5F9AF8]/35 hover:-translate-y-0.5 hover:bg-[#F2F7FF]",
  ),
  light: cn(btnBase, "bg-white text-[#2F5FC4] hover:-translate-y-0.5 hover:bg-[#F2F7FF]"),
  ghostLight: cn(btnBase, "text-white ring-1 ring-white/40 hover:bg-white/10"),
};

/** Router link to the existing app login page. */
export function LoginLink({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <Link to="/login" className={className}>
      {children}
    </Link>
  );
}
