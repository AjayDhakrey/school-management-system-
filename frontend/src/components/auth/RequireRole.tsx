import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth, toDisplayRole, DASHBOARD_PATH_FOR_ROLE } from "@/lib/auth-context";
import type { Role } from "@/lib/app-context";

/**
 * Blocks a route unless the authenticated user's role is in `roles`.
 * Unauthenticated -> /login (remembers where they were headed).
 * Authenticated but wrong role -> their own dashboard (manual URL edits
 * cannot reach another role's pages, per the multi-tenant RBAC spec).
 */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  const displayRole = toDisplayRole(user);
  if (!roles.includes(displayRole)) {
    return <Navigate to={DASHBOARD_PATH_FOR_ROLE[user.role]} replace />;
  }

  return <>{children}</>;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}
