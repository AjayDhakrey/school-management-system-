import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError, onUnauthorized } from "./api";
import type { Role } from "./app-context";

export type BackendRole = "SUPER_ADMIN" | "SCHOOL_ADMIN" | "TEACHER" | "STAFF" | "PARENT" | "STUDENT";
export type StaffDepartment = "ADMIN" | "ACCOUNTS" | "LIBRARY" | "TRANSPORT" | null;

export interface AuthUser {
  id: string;
  role: BackendRole;
  schoolId: string | null;
  department: StaffDepartment;
  name: string;
  email: string;
  linkedTeacherId: string | null;
  linkedParentId: string | null;
  linkedStudentId: string | null;
  linkedStaffId: string | null;
}

const STAFF_DEPARTMENT_LABEL: Record<Exclude<StaffDepartment, null>, Role> = {
  ADMIN: "Staff" as Role,
  ACCOUNTS: "Accountant",
  LIBRARY: "Librarian",
  TRANSPORT: "Transport Manager",
};

/** Maps a backend (role, department) pair to the legacy display Role used by the existing UI/nav filtering. */
export function toDisplayRole(user: AuthUser | null): Role {
  if (!user) return "Student";
  switch (user.role) {
    case "SUPER_ADMIN":
      return "Super Admin";
    case "SCHOOL_ADMIN":
      return "School Admin";
    case "TEACHER":
      return "Teacher";
    case "PARENT":
      return "Parent";
    case "STUDENT":
      return "Student";
    case "STAFF":
      return user.department ? STAFF_DEPARTMENT_LABEL[user.department] : ("Staff" as Role);
  }
}

export const DASHBOARD_PATH_FOR_ROLE: Record<BackendRole, string> = {
  SUPER_ADMIN: "/super-admin/dashboard",
  SCHOOL_ADMIN: "/school-admin/dashboard",
  TEACHER: "/teacher/dashboard",
  STAFF: "/staff/dashboard",
  PARENT: "/parent/dashboard",
  STUDENT: "/student/dashboard",
};

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);
const STORAGE_KEY = "scholaris-auth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const removeUnauthorizedHandler = onUnauthorized(() => {
      localStorage.removeItem(STORAGE_KEY);
      if (active) setUser(null);
      if (window.location.pathname !== "/login") window.location.assign("/login");
    });

    async function restoreSession() {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        if (active) setLoading(false);
        return;
      }
      try {
        const parsed = JSON.parse(raw) as { token?: unknown };
        if (typeof parsed.token !== "string" || !parsed.token) throw new Error("Invalid stored session");
        const response = await api.get<{ user: AuthUser }>("/auth/me");
        if (active) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: parsed.token, user: response.user }));
          setUser(response.user);
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        if (active) setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    void restoreSession();
    return () => {
      active = false;
      removeUnauthorizedHandler();
    };
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post<{ token: string; user: AuthUser }>("/auth/login", { email, password });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(res));
    setUser(res.user);
    return res.user;
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  };

  const value = useMemo<AuthState>(() => ({ user, loading, login, logout }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { ApiError };
