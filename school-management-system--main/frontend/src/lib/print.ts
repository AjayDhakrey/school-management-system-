/** Escapes text for safe use inside printed HTML. */
export function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Prints a self-contained HTML document through a hidden iframe, so the printout never depends on
 * (or fights with) the app's own layout and print CSS. The iframe is removed after printing.
 */
export function printHtml(title: string, body: string, css: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText =
    "position:fixed;top:0;left:0;width:100%;height:100%;border:0;opacity:0;pointer-events:none;z-index:-9999;";
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
      `<style>${css}</style></head><body>${body}</body></html>`,
  );
  doc.close();

  const cleanup = () => setTimeout(() => frame.remove(), 500);
  win.addEventListener("afterprint", cleanup, { once: true });
  // Give the frame a tick to lay out (and load any logo) before opening the print dialog.
  setTimeout(() => {
    win.focus();
    win.print();
    // Browsers that don't fire afterprint still get cleaned up.
    setTimeout(cleanup, 60_000);
  }, 250);
}
