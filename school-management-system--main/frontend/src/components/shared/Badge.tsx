// Small counter badge, modeled after MUI's Badge (https://mui.com/material-ui/react-badge/):
// overlaps the top-right corner of its anchor and hides itself when there's nothing to show.
export function Badge({ count, max = 99 }: { count?: number | undefined; max?: number }) {
  if (!count || count <= 0) return null;
  const display = count > max ? `${max}+` : String(count);

  return (
    <span
      className="absolute -top-1 -right-1 z-10 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground ring-2 ring-card"
      aria-label={`${display} pending`}
    >
      {display}
    </span>
  );
}
