"use client";
// Text aus Bon-Dateien holen, komplett im Browser: PDF über pdf.js, Fotos über Tesseract.js.
// Kein Server, keine KI, keine externe API. Tesseract lädt beim ersten Mal sein
// deutsches Sprachmodell (ca. 2 MB) aus dem Open-Source-CDN und cached es danach.

/** Liest einen PDF-Bon und baut die Zeilen aus den Textpositionen wieder auf. */
export async function pdfToText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"; // per postinstall nach public/ kopiert
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const out: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // Textstücke nach y (Zeile) gruppieren, innerhalb der Zeile nach x sortieren
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const [, , , , x, y] = item.transform as number[];
      const key = Math.round(y / 2) * 2; // kleine Abweichungen zusammenfassen
      const row = rows.get(key) ?? [];
      row.push({ x, s: item.str });
      rows.set(key, row);
    }
    const sorted = [...rows.entries()].sort((a, b) => b[0] - a[0]);
    for (const [, parts] of sorted) {
      parts.sort((a, b) => a.x - b.x);
      // Große Lücken als doppelte Leerzeichen, damit der Parser Spalten erkennt
      let line = "";
      let lastX = -Infinity;
      for (const part of parts) {
        line += (line && part.x - lastX > 20 ? "   " : line ? " " : "") + part.s;
        lastX = part.x + part.s.length * 5;
      }
      out.push(line);
    }
  }
  return out.join("\n");
}

/** Texterkennung für Fotos von Papierbons. */
export async function imageToText(file: File, onProgress?: (p: number) => void): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("deu", 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") onProgress?.(m.progress);
    },
  });
  try {
    const { data } = await worker.recognize(file);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

export async function fileToText(file: File, onProgress?: (p: number) => void): Promise<string> {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return pdfToText(file);
  return imageToText(file, onProgress);
}
