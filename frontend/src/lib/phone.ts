/** Phone numbers are stored and entered as plain 10-digit Indian mobile numbers — no +91. */
export const PHONE_LENGTH = 10;

/**
 * Digits only, without a country code or trunk prefix: "+91 98745 69658" → "9874569658",
 * "09874569658" → "9874569658". Longer input is cut to 10 digits.
 */
export function cleanPhone(value: string | null | undefined) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length > PHONE_LENGTH && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length > PHONE_LENGTH && digits.startsWith("0")) digits = digits.slice(1);
  return digits.slice(0, PHONE_LENGTH);
}

export const isValidPhone = (value: string) => /^\d{10}$/.test(value);

/** Input attributes every phone field shares — numeric keypad, 10 digits, browser validation. */
export const PHONE_INPUT_PROPS = {
  type: "tel",
  inputMode: "numeric",
  autoComplete: "tel-national",
  maxLength: PHONE_LENGTH,
  pattern: "[0-9]{10}",
  title: "Enter a 10-digit mobile number",
  placeholder: "10-digit mobile number",
} as const;
