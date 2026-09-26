import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "./api";
import type { Role } from "./app-context";
import { supabase } from "./supabase";

export type BackendRole =
  "SUPER_ADMIN" | "SCHOOL_ADMIN" | "TEACHER" | "STAFF" | "PARENT" | "STUDENT";
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

function mapProfile(profile: Record<string, unknown>): AuthUser {
  return {
    id: String(profile["id"]),
    role: profile["role"] as BackendRole,
    schoolId: (profile["school_id"] as string | null) ?? null,
    department: (profile["department"] as StaffDepartment) ?? null,
    name: String(profile["name"] ?? ""),
    email: String(profile["email"] ?? ""),
    linkedTeacherId: (profile["linked_teacher_id"] as string | null) ?? null,
    linkedParentId: (profile["linked_parent_id"] as string | null) ?? null,
    linkedStudentId: (profile["linked_student_id"] as string | null) ?? null,
    linkedStaffId: (profile["linked_staff_id"] as string | null) ?? null,
  };
}

async function loadProfile(userId: string): Promise<AuthUser> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select(
      "id, role, school_id, department, name, email, linked_teacher_id, linked_parent_id, linked_student_id, linked_staff_id, status",
    )
    .eq("id", userId)
    .single();

  if (error) throw new ApiError(401, error.message, error);
  if (data.status === "SUSPENDED") {
    await supabase.auth.signOut();
    throw new ApiError(403, "This account has been suspended");
  }
  return mapProfile(data);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  // Every cached query result (students, fees, transport, ...) is keyed generically, not per
  // user/school — without clearing it here, switching accounts in the same tab (or even just
  // logging out and back in) could briefly render the previous session's cached data, or a
  // stale query that now 403s under the new role's RLS. Always start the next session clean.
  const queryClient = useQueryClient();

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (data.session?.user && active) setUser(await loadProfile(data.session.user.id));
      } catch {
        if (active) setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    void restoreSession();
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" && active) {
        setUser(null);
        queryClient.clear();
      }
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [queryClient]);

  const login = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) throw new ApiError(401, error?.message ?? "Unable to sign in", error);
    const profile = await loadProfile(data.user.id);
    queryClient.clear();
    setUser(profile);
    return profile;
  };

  const logout = () => {
    setUser(null);
    queryClient.clear();
    void supabase.auth.signOut();
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
