// Proxy URL for images to bypass CORS
export const getProxiedImageUrl = (originalUrl: string): string => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  return `${supabaseUrl}/functions/v1/image-proxy?url=${encodeURIComponent(originalUrl)}`;
};

// Find the vertical baseline of the first line of text by scanning for dark pixels
const findTextBaseline = (
  ctx: CanvasRenderingContext2D,
  canvasWidth: number
): number => {
  const defaultBaseline = 105; // Fallback position
  const scanStartX = 260; // Start scanning after our white rectangle
  const scanEndX = Math.min(canvasWidth, 500); // Scan a reasonable width
  const scanStartY = 20; // Start a bit from top
  const scanEndY = 150; // Don't scan too far down
  const darkThreshold = 200; // Pixel is "dark" if RGB values below this

  try {
    // Scan rows from top to find first row with dark pixels (text)
    for (let y = scanStartY; y < scanEndY; y++) {
      const imageData = ctx.getImageData(scanStartX, y, scanEndX - scanStartX, 1);
      let darkPixelCount = 0;

      for (let i = 0; i < imageData.data.length; i += 4) {
        const r = imageData.data[i];
        const g = imageData.data[i + 1];
        const b = imageData.data[i + 2];

        if (r < darkThreshold && g < darkThreshold && b < darkThreshold) {
          darkPixelCount++;
        }
      }

      // If we find a row with enough dark pixels, we've found text top
      if (darkPixelCount > 3) {
        // Found top of text, estimate baseline (~38px down for 48px font)
        return y + 38;
      }
    }
  } catch (e) {
    console.warn("Text detection failed, using default position");
  }

  return defaultBaseline;
};

// Process image: draw white rectangle and new number
export const processQuestionImage = async (
  imageUrl: string,
  newNumber: number
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

      // Draw original image
      ctx.drawImage(img, 0, 0);

      // Find the baseline of existing text before we cover it
      const textBaseline = findTextBaseline(ctx, img.width);

      // Draw white rectangle at top-left (255x155 as specified)
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, 255, 155);

      // Draw new question number in Cambridge style (bold serif)
      // Position: right-aligned at 228px from left, vertical aligned to detected text
      ctx.fillStyle = "#000000";
      ctx.font = "bold 48px 'Times New Roman', Times, serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText(`${newNumber}`, 228, textBaseline);

      // Convert to data URL
      resolve(canvas.toDataURL("image/jpeg", 0.95));
    };

    img.onerror = () => {
      console.error("Failed to load image:", imageUrl);
      reject(new Error("Failed to load image"));
    };

    // Use proxied URL to bypass CORS
    img.src = getProxiedImageUrl(imageUrl);
  });
};
