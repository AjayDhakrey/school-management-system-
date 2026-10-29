import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { PHONE_INPUT_PROPS, cleanPhone } from "@/lib/phone";

/**
 * A 10-digit mobile number field: only digits can be typed or pasted, no +91. Works controlled
 * (`value` + `onChange`) or uncontrolled (`name` + `defaultValue`, read via FormData).
 */
export function PhoneInput({
  value,
  defaultValue,
  onChange,
  ...props
}: Omit<ComponentProps<typeof Input>, "type">) {
  return (
    <Input
      {...PHONE_INPUT_PROPS}
      {...props}
      {...(value !== undefined ? { value: cleanPhone(String(value)) } : {})}
      {...(defaultValue !== undefined ? { defaultValue: cleanPhone(String(defaultValue)) } : {})}
      onChange={(e) => {
        const cleaned = cleanPhone(e.target.value);
        if (cleaned !== e.target.value) e.target.value = cleaned;
        onChange?.(e);
      }}
    />
  );
}
