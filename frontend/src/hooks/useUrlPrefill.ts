import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Hands `?<key>=value` to `apply` once, then drops it from the URL. The header search uses
 * this to open a page with its own search box already filled in; dropping the param means
 * clearing that box later isn't undone by the URL, and the same link works again.
 */
export function useUrlPrefill(key: string, apply: (value: string) => void) {
  const [params, setParams] = useSearchParams();
  const value = params.get(key);
  useEffect(() => {
    if (value === null) return;
    apply(value);
    setParams(
      (next) => {
        next.delete(key);
        return next;
      },
      { replace: true },
    );
    // `apply` is usually an inline setter; only a new value should re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, value, setParams]);
}
