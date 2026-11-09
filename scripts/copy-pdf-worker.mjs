// Kopiert den pdf.js-Worker nach public/, damit er ohne CDN ausgeliefert wird.
import { copyFileSync, existsSync } from "node:fs";

const src = "node_modules/pdfjs-dist/build/pdf.worker.min.mjs";
if (existsSync(src)) copyFileSync(src, "public/pdf.worker.min.mjs");
