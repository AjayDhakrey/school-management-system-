import { useAuth } from "@/lib/auth-context";
import { SCHOOL } from "@/lib/siteData";
import { useSchoolProfile } from "@/hooks/useApi";

export interface SchoolBranding {
  name: string;
  shortName: string;
  session: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  principal: string;
  /** Uploaded school logo, or null to fall back to the bundled placeholder. */
  logoUrl: string | null;
  /** False while the tenant's own profile is still loading, or for Super Admin. */
  isTenantSchool: boolean;
}

/**
 * Resolves the branding shown in the shell, on report cards and on receipts.
 *
 * Every school that signs up gets its own row in `schools`, so the name/session/logo must come
 * from that row — not from the bundled `SCHOOL` sample. The sample is only a fallback, used
 * while the profile loads, for Super Admin (who belongs to no school), and for any field the
 * school has not filled in yet.
 */
export function useSchoolBranding(): SchoolBranding {
  const { user } = useAuth();
  const schoolUser = Boolean(user && user.role !== "SUPER_ADMIN");
  const { data: school } = useSchoolProfile(schoolUser);

  return {
    name: school?.name || SCHOOL.name,
    shortName: school?.short_name || SCHOOL.shortName,
    session: school?.session || SCHOOL.session,
    tagline: school?.tagline || SCHOOL.tagline,
    address: school?.address || SCHOOL.address,
    phone: school?.phone || SCHOOL.phone,
    email: school?.email || SCHOOL.email,
    principal: school?.principal || SCHOOL.principal,
    logoUrl: school?.logo_url || null,
    isTenantSchool: Boolean(school),
  };
}
