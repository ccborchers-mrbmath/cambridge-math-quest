import { logger } from "@/lib/logger";

// Proxy URL for images to bypass CORS
export const getProxiedImageUrl = (originalUrl: string): string => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  // Supabase Storage signed URLs already serve CORS-friendly headers,
  // so we can load them directly without going through the proxy.
  if (supabaseUrl && originalUrl.startsWith(supabaseUrl)) {
    return originalUrl;
  }
  return `${supabaseUrl}/functions/v1/image-proxy?url=${encodeURIComponent(originalUrl)}`;
};

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Detect the bounding box of dark content (the original question number)
// in the top-left region of the image
const detectNumberBoundingBox = (
  ctx: CanvasRenderingContext2D,
  canvasWidth: number
): BoundingBox | null => {
  // Scan region: top-left area where Cambridge papers place the question number
  const scanWidth = Math.min(250, canvasWidth);
  const scanHeight = 160;
  const darkThreshold = 180; // Pixel is "dark" if RGB values below this
  const minDarkPixels = 5; // Minimum dark pixels in a row/column to count

  try {
    const imageData = ctx.getImageData(0, 0, scanWidth, scanHeight);
    const data = imageData.data;

    let minX = scanWidth;
    let minY = scanHeight;
    let maxX = 0;
    let maxY = 0;
    let foundDark = false;

    // Scan every pixel in the region to find the bounding box of dark content
    for (let y = 0; y < scanHeight; y++) {
      for (let x = 0; x < scanWidth; x++) {
        const idx = (y * scanWidth + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        if (r < darkThreshold && g < darkThreshold && b < darkThreshold) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
          foundDark = true;
        }
      }
    }

    if (!foundDark || (maxX - minX) < 5 || (maxY - minY) < 5) {
      return null;
    }

    // Validate: the detected region should look like a number (reasonable aspect ratio)
    const width = maxX - minX;
    const height = maxY - minY;

    // Numbers are typically taller than wide, or roughly square for "10", "11" etc.
    // Filter out noise: region should be within reasonable bounds
    if (width > 200 || height > 120) {
      // Too large — probably detected decorative elements or borders, not just the number
      // Try to narrow by looking for a cluster of dark pixels in the left portion
      return detectNumberCluster(data, scanWidth, scanHeight, darkThreshold);
    }

    return { x: minX, y: minY, width, height };
  } catch (e) {
    console.warn("Number detection failed:", e);
    return null;
  }
};

// More refined detection: find the main cluster of dark pixels (the number)
// by looking for connected dark regions in horizontal strips
const detectNumberCluster = (
  data: Uint8ClampedArray,
  scanWidth: number,
  scanHeight: number,
  darkThreshold: number
): BoundingBox | null => {
  // Count dark pixels per row to find the vertical range with the most activity
  const rowCounts: number[] = [];
  for (let y = 0; y < scanHeight; y++) {
    let count = 0;
    for (let x = 0; x < Math.min(scanWidth, 200); x++) {
      const idx = (y * scanWidth + x) * 4;
      if (
        data[idx] < darkThreshold &&
        data[idx + 1] < darkThreshold &&
        data[idx + 2] < darkThreshold
      ) {
        count++;
      }
    }
    rowCounts.push(count);
  }

  // Find the densest vertical band (sliding window of ~50px height)
  const windowSize = 50;
  let bestStart = 0;
  let bestSum = 0;
  for (let start = 0; start < scanHeight - windowSize; start++) {
    let sum = 0;
    for (let i = start; i < start + windowSize; i++) {
      sum += rowCounts[i];
    }
    if (sum > bestSum) {
      bestSum = sum;
      bestStart = start;
    }
  }

  if (bestSum < 20) return null;

  // Within that vertical band, find horizontal extent
  let minX = scanWidth;
  let maxX = 0;
  let minY = scanHeight;
  let maxY = 0;

  for (let y = bestStart; y < bestStart + windowSize && y < scanHeight; y++) {
    for (let x = 0; x < Math.min(scanWidth, 200); x++) {
      const idx = (y * scanWidth + x) * 4;
      if (
        data[idx] < darkThreshold &&
        data[idx + 1] < darkThreshold &&
        data[idx + 2] < darkThreshold
      ) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX <= minX || maxY <= minY) return null;

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

// Font family used for the burnt-in number. Kept identical between the
// preview overlay (HTML) and the bake step (canvas) so what the user sees
// is what gets saved.
export const NUMBER_FONT_FAMILY = "'Times New Roman', Times, serif";

export interface ProcessedNumberedImage {
  // Data URL of the source image with the original Cambridge question
  // number erased (white rectangle in its place). The new number is NOT
  // drawn — it is rendered as a draggable overlay in the UI and only
  // baked in when the user downloads.
  cleanedImageUrl: string;
  // Natural pixel dimensions of the image.
  width: number;
  height: number;
  // Default position of the new number's top-left corner, in image
  // pixels. Anchored to where the original number was detected; the
  // user can drag it if it looks off.
  defaultX: number;
  defaultY: number;
  // Font size (image pixels) used when baking the number in.
  fontSize: number;
}

// Process image: detect the original number, erase it, and return the
// cleaned image plus the default position/size for the new number.
export const processQuestionImage = async (
  imageUrl: string,
  newNumber: number
): Promise<ProcessedNumberedImage> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      ctx.drawImage(img, 0, 0);

      const bbox = detectNumberBoundingBox(ctx, img.width);

      let eraseWidth: number;
      let eraseHeight: number;
      let numberRightX: number;
      let numberBaselineY: number;
      const fontSize = 48;

      if (bbox) {
        const padX = 15;
        const padY = 10;
        eraseWidth = bbox.x + bbox.width + padX;
        eraseHeight = bbox.y + bbox.height + padY;
        numberRightX = bbox.x + bbox.width + 4;
        numberBaselineY = bbox.y + bbox.height + 10;
      } else {
        eraseWidth = 255;
        eraseHeight = 155;
        numberRightX = 228;
        numberBaselineY = 105;
      }

      // Erase the original number with a white rectangle.
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, eraseWidth, eraseHeight);

      // Measure the new number so we can convert (right-anchor, baseline)
      // to a top-left position that matches the HTML overlay.
      ctx.font = `bold ${fontSize}px ${NUMBER_FONT_FAMILY}`;
      const textWidth = ctx.measureText(String(newNumber)).width;
      const defaultX = Math.max(0, numberRightX - textWidth);
      const defaultY = Math.max(0, numberBaselineY - fontSize);

      resolve({
        cleanedImageUrl: canvas.toDataURL("image/jpeg", 0.95),
        width: img.width,
        height: img.height,
        defaultX,
        defaultY,
        fontSize,
      });
    };

    img.onerror = () => {
      logger.error("Failed to load image:", imageUrl);
      reject(new Error("Failed to load image"));
    };

    img.src = getProxiedImageUrl(imageUrl);
  });
};

// Bake the new question number into the cleaned image at the given
// top-left position (image pixel coordinates). Used at download time so
// any user adjustment made in the preview is burnt in.
export const bakeNumberIntoImage = async (
  cleanedImageUrl: string,
  newNumber: number,
  x: number,
  y: number,
  fontSize: number
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      ctx.fillStyle = "#000000";
      ctx.font = `bold ${fontSize}px ${NUMBER_FONT_FAMILY}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(String(newNumber), x, y);
      resolve(canvas.toDataURL("image/jpeg", 0.95));
    };
    img.onerror = () => reject(new Error("Failed to load cleaned image"));
    img.src = cleanedImageUrl;
  });
};

// Process markscheme image (just fetch via proxy, no modifications)
export const processMarkschemeImage = async (
  markschemeUrl: string
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/jpeg", 0.95));
    };

    img.onerror = () => {
      logger.error("Failed to load markscheme:", markschemeUrl);
      reject(new Error("Failed to load markscheme"));
    };

    img.src = getProxiedImageUrl(markschemeUrl);
  });
};
