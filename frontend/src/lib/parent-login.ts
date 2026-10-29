import { cleanPhone, isValidPhone } from "./phone";

// A parent's mobile-number login is stored in Supabase Auth under an internal address that
// is never mailed. Keep in sync with PARENT_LOGIN_DOMAIN in the manage-user-login function.
export const PARENT_LOGIN_DOMAIN = "parents.edunex.invalid";

/** A typed mobile number ("98765 43210", "+919876543210") as its 10 digits, else null. */
export function mobileFromIdentifier(identifier: string) {
  const value = identifier.trim();
  if (!/^[\d\s+()-]+$/.test(value)) return null;
  const phone = cleanPhone(value);
  return isValidPhone(phone) ? phone : null;
}

/** The mobile number behind an internal login address, or null for a normal email. */
export function mobileFromEmail(email: string) {
  const suffix = `@${PARENT_LOGIN_DOMAIN}`;
  return email.toLowerCase().endsWith(suffix) ? email.slice(0, -suffix.length) : null;
}

/**
 * First password: the first four letters of the name (first one capital) + the first four
 * digits of the mobile — ("Rajesh Kumar", "9876543210") → "Raje9876". Null when it can't be
 * made. Keep in sync with parentPassword in the manage-user-login function.
 */
export function parentFirstPassword(name: string, phone: string | null | undefined) {
  const mobile = cleanPhone(phone);
  if (!isValidPhone(mobile)) return null;
  const letters = name.replace(/[^A-Za-z]/g, "").slice(0, 4);
  const pw = letters.charAt(0).toUpperCase() + letters.slice(1).toLowerCase() + mobile.slice(0, 4);
  return pw.length >= 6 ? pw : null;
}
