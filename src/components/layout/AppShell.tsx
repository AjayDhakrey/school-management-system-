import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { Header } from "./Header";
import { MobileBottomNav } from "./MobileBottomNav";

export function AppShell() {
  return (
    <div className="flex h-screen overflow-hidden bg-surface lg:h-[calc(100vh-2rem)] lg:border lg:border-border lg:shadow-[var(--shadow-shell)]">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* The header scrolls with the page: the mobile hero slides away, while the desktop
            bar sticks to the top of this scroller. Bottom padding below lg keeps the last
            content clear of the floating bottom nav. */}
        <main className="scrollbar-slim flex min-w-0 flex-1 flex-col overflow-y-auto pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:pb-6">
          <Header />
          <div className="flex-1 px-3 pt-4 sm:px-5 sm:pt-6">
            <Outlet />
          </div>
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
}
