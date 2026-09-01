import { pdfFileToImages } from "@/utils/pdfToImages";

export const MAX_WORK_IMAGE_BYTES = 10 * 1024 * 1024;

export const readImageAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

export interface IngestResult {
  images: string[];
  /** Human-readable reasons individual files were skipped. */
  skipped: string[];
}

/**
 * Turn a set of picked files into data-URL page images: images pass through,
 * PDFs are rasterised a page at a time, anything else is skipped with a
 * reason the caller can surface.
 */
export const filesToWorkImages = async (files: File[]): Promise<IngestResult> => {
  const images: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    if (file.size > MAX_WORK_IMAGE_BYTES) {
      skipped.push(`${file.name} is over 10MB`);
      continue;
    }
    if (file.type === "application/pdf") {
      try {
        images.push(...(await pdfFileToImages(file)));
      } catch {
        skipped.push(`Couldn't read ${file.name} as a PDF`);
      }
    } else if (file.type.startsWith("image/")) {
      images.push(await readImageAsDataUrl(file));
    } else {
      skipped.push(`${file.name} isn't an image or PDF`);
    }
  }

  return { images, skipped };
};
