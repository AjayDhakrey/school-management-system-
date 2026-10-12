/** Renders a DOM element into an A4 PDF and downloads it — works on mobile, unlike window.print(). */
export async function downloadElementAsPdf(element: HTMLElement, filename: string) {
  // Loaded on demand so the PDF libraries stay out of the main bundle.
  const [{ toPng }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);

  const width = element.offsetWidth;
  const height = element.offsetHeight;
  const dataUrl = await toPng(element, {
    pixelRatio: 2,
    backgroundColor: "#ffffff",
    cacheBust: true,
    // A cross-origin logo that can't be fetched shouldn't abort the whole receipt.
    imagePlaceholder:
      "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  });

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = 10;
  const pageWidth = pdf.internal.pageSize.getWidth() - margin * 2;
  const pageHeight = pdf.internal.pageSize.getHeight() - margin * 2;
  // Fit to the page width, shrinking further if the receipt is taller than one page.
  const scale = Math.min(pageWidth / width, pageHeight / height);
  const w = width * scale;
  const h = height * scale;
  pdf.addImage(dataUrl, "PNG", margin + (pageWidth - w) / 2, margin, w, h);
  pdf.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}
