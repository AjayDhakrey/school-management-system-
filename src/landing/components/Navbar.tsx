import { useEffect, useState } from "react";
import { LogIn, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_LINKS } from "../landing-data";
import { Logo, LoginLink, buttonStyles } from "./primitives";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5">
      <div
        className={cn(
          "mx-auto max-w-7xl rounded-[26px] border backdrop-blur-xl backdrop-saturate-150 transition-all duration-300",
          scrolled || open
            ? "border-white/60 bg-white/55 shadow-[0_12px_40px_-18px_rgba(20,28,58,0.35)]"
            : "border-white/40 bg-white/25 shadow-[0_8px_30px_-20px_rgba(20,28,58,0.25)]",
        )}
      >
        <nav className="flex h-16 items-center justify-between px-3 sm:px-5">
          <Logo />

          <ul className="hidden items-center gap-1 lg:flex">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  className="rounded-full px-4 py-2 text-sm font-medium text-[#3c4766] transition-colors hover:bg-[#5F9AF8]/10 hover:text-[#2F5FC4]"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="hidden items-center gap-3 lg:flex">
            <LoginLink className={cn(buttonStyles.outline, "px-5 py-2.5 text-sm")}>
              <LogIn className="h-4 w-4" /> Login
            </LoginLink>
            <a href="#demo" className={cn(buttonStyles.primary, "px-5 py-2.5 text-sm")}>
              Book a demo
            </a>
          </div>

          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="grid h-11 w-11 place-items-center rounded-2xl bg-[#5F9AF8]/10 text-[#2F5FC4] lg:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </nav>

        {open && (
          <div className="border-t border-white/50 px-3 pb-5 pt-3 sm:px-5 lg:hidden">
            <ul className="grid gap-1">
              {NAV_LINKS.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-xl px-4 py-3 text-base font-medium text-[#3c4766] hover:bg-[#5F9AF8]/10"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <LoginLink className={cn(buttonStyles.outline, "py-3 text-sm")}>
                <LogIn className="h-4 w-4" /> Login
              </LoginLink>
              <a
                href="#demo"
                onClick={() => setOpen(false)}
                className={cn(buttonStyles.primary, "py-3 text-sm")}
              >
                Book a demo
              </a>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
