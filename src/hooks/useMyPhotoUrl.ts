import { useAuth, toDisplayRole } from "@/lib/auth-context";
import { useMyStudentProfile, useMyTeacherProfile } from "@/hooks/useApi";

/** The signed-in user's own profile photo, if their role has one — shared by header/sidebar avatars. */
export function useMyPhotoUrl() {
  const { user } = useAuth();
  const role = toDisplayRole(user);
  const { data: student } = useMyStudentProfile(role === "Student");
  const { data: teacher } = useMyTeacherProfile(role === "Teacher");
  return student?.photo_url ?? teacher?.photo_url ?? undefined;
}
