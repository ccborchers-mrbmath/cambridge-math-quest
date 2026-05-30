import { getProxiedImageUrl } from "@/utils/imageProcessing";

const hasClipboardWrite = (): boolean =>
  typeof navigator !== "undefined" &&
  !!navigator.clipboard &&
  typeof (navigator.clipboard as Clipboard).write === "function" &&
  typeof window !== "undefined" &&
  typeof window.ClipboardItem !== "undefined";

const hasClipboardRead = (): boolean =>
  typeof navigator !== "undefined" &&
  !!navigator.clipboard &&
  typeof (navigator.clipboard as Clipboard).read === "function";

/**
 * Fetch the question image (via the CORS-safe image-proxy edge function) and
 * copy it to the OS clipboard as a PNG. Throws on failure so the caller can
 * show a friendly toast.
 */
export const copyImageUrlToClipboard = async (url: string): Promise<void> => {
  if (!hasClipboardWrite()) {
    throw new Error("CLIPBOARD_UNSUPPORTED");
  }

  const response = await fetch(getProxiedImageUrl(url));
  if (!response.ok) {
    throw new Error("FETCH_FAILED");
  }

  const sourceBlob = await response.blob();

  // Most browsers require image/png for clipboard image writes. Re-encode
  // through a canvas if the source isn't already PNG.
  let pngBlob: Blob = sourceBlob;
  if (sourceBlob.type !== "image/png") {
    pngBlob = await reencodeAsPng(sourceBlob);
  }

  await navigator.clipboard.write([
    new ClipboardItem({ "image/png": pngBlob }),
  ]);
};

const reencodeAsPng = (blob: Blob): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("CANVAS_UNAVAILABLE"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((out) => {
        URL.revokeObjectURL(url);
        if (!out) {
          reject(new Error("ENCODE_FAILED"));
          return;
        }
        resolve(out);
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("IMAGE_LOAD_FAILED"));
    };
    img.src = url;
  });

/**
 * Read the first image found on the OS clipboard and return it as a File ready
 * to feed any existing upload handler. Throws if the clipboard has no image or
 * the browser denies access.
 */
export const readImageFromClipboard = async (): Promise<File> => {
  if (!hasClipboardRead()) {
    throw new Error("CLIPBOARD_UNSUPPORTED");
  }

  const items = await navigator.clipboard.read();
  for (const item of items) {
    const imageType = item.types.find((t) => t.startsWith("image/"));
    if (imageType) {
      const blob = await item.getType(imageType);
      const ext = imageType.split("/")[1] || "png";
      return new File([blob], `pasted-work.${ext}`, { type: imageType });
    }
  }

  throw new Error("NO_IMAGE_ON_CLIPBOARD");
};