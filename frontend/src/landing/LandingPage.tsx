import { useEffect } from "react";
import "./landing.css";
import { Navbar } from "./components/Navbar";
import { Hero } from "./components/Hero";
import { Features, RoleStrip } from "./components/Features";
import { AppShowcase } from "./components/AppShowcase";
import { HowItWorks } from "./components/HowItWorks";
import { DemoForm } from "./components/DemoForm";
import { Faq, FinalCta, Footer } from "./components/Faq";
import { BRAND } from "./landing-data";

/** Public marketing page shown at "/" to visitors who are not logged in. */
export default function LandingPage() {
  useEffect(() => {
    const previous = document.title;
    document.title = `${BRAND.name} — ${BRAND.tagline} Software`;
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="landing-root min-h-screen overflow-x-clip bg-[#F5F8FE] font-sans text-[#141C3A] antialiased">
      <Navbar />
      <main>
        <Hero />
        <RoleStrip />
        <Features />
        <AppShowcase />
        <HowItWorks />
        <DemoForm />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
