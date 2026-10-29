import { PARENT_LOGIN_DOMAIN, mobileFromIdentifier } from "./parent-login";

// A Student ID login is stored in Supabase Auth under an internal address that is never
// mailed. Keep in sync with STUDENT_LOGIN_DOMAIN in the manage-user-login function.
export const STUDENT_LOGIN_DOMAIN = "students.edunex.invalid";

/**
 * What the login form sends to Auth: emails as typed, a parent's mobile number and a
 * Student ID as their internal addresses.
 */
export function loginEmailFor(identifier: string) {
  const value = identifier.trim();
  if (value.includes("@")) return value.toLowerCase();
  const mobile = mobileFromIdentifier(value);
  if (mobile) return `${mobile}@${PARENT_LOGIN_DOMAIN}`;
  return `${value.toLowerCase()}@${STUDENT_LOGIN_DOMAIN}`;
}

/** The Student ID behind an internal login address, or null for a normal email. */
export function studentIdFromEmail(email: string) {
  const suffix = `@${STUDENT_LOGIN_DOMAIN}`;
  return email.toLowerCase().endsWith(suffix) ? email.slice(0, -suffix.length).toUpperCase() : null;
}
