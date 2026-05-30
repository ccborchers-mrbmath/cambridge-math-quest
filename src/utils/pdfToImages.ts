import * as pdfjsLib from "pdfjs-dist";
// Vite-friendly worker import
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

const MAX_DIMENSION = 1800;

/**
 * Convert each page of a PDF file into a JPEG data URL.
 * Pages are downscaled to keep individual images under ~10MB.
 */
export const pdfFileToImages = async (file: File): Promise<string[]> => {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const images: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(
      2,
      MAX_DIMENSION / Math.max(baseViewport.width, baseViewport.height)
    );
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not create canvas context for PDF page");

    // White background — markschemes/handwriting usually assume white paper
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    images.push(canvas.toDataURL("image/jpeg", 0.85));
  }

  return images;
};