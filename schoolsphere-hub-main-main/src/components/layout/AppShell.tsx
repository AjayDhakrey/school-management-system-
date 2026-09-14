import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { Header } from "./Header";

export function AppShell() {
  return (

      <div className="flex h-screen overflow-hidden bg-surface lg:h-[calc(100vh-2rem)] lg:border lg:border-border lg:shadow-[var(--shadow-shell)]">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Header />
          <main className="scrollbar-slim min-w-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5 sm:py-6">
            <Outlet />
          </main>
      </div>
    </div>
  );
}
