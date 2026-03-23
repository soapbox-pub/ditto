/** Maximum dimension (width or height) for resized images. */
const MAX_DIMENSION = 1920;

/** JPEG quality for resized images (0–1). */
const JPEG_QUALITY = 0.85;

interface ResizedImage {
  /** The optimized image file (JPEG or PNG, whichever is smaller). */
  file: File;
  /** Pixel dimensions string, e.g. "1920x1080". */
  dimensions: string;
}

/**
 * Resize an image file so its longest side is at most {@link MAX_DIMENSION}
 * pixels, and encode it in the smallest format between JPEG and PNG.
 *
 * If the image already fits within the dimension limit, the original file
 * is returned unchanged (no re-encoding overhead).
 */
export async function resizeImage(file: File): Promise<ResizedImage> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  // Already within limits — return the original file as-is.
  if (width <= MAX_DIMENSION && height <= MAX_DIMENSION) {
    bitmap.close();
    return {
      file,
      dimensions: `${width}x${height}`,
    };
  }

  // Scale down preserving aspect ratio.
  const scale = MAX_DIMENSION / Math.max(width, height);
  const newWidth = Math.round(width * scale);
  const newHeight = Math.round(height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = newWidth;
  canvas.height = newHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('Canvas 2D context unavailable');
  }

  ctx.drawImage(bitmap, 0, 0, newWidth, newHeight);
  bitmap.close();

  // Encode as both JPEG and PNG in parallel, then pick the smaller one.
  const [jpegBlob, pngBlob] = await Promise.all([
    canvasToBlob(canvas, 'image/jpeg', JPEG_QUALITY),
    canvasToBlob(canvas, 'image/png'),
  ]);

  const best = jpegBlob.size <= pngBlob.size
    ? { blob: jpegBlob, ext: '.jpg', mime: 'image/jpeg' as const }
    : { blob: pngBlob, ext: '.png', mime: 'image/png' as const };

  const resizedFile = new File([best.blob], replaceExtension(file.name, best.ext), {
    type: best.mime,
  });

  return {
    file: resizedFile,
    dimensions: `${newWidth}x${newHeight}`,
  };
}

/** Promisified `canvas.toBlob`. */
function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error(`Failed to encode ${type}`))),
      type,
      quality,
    );
  });
}

/** Replace or append a file extension. */
function replaceExtension(filename: string, ext: string): string {
  const dotIndex = filename.lastIndexOf('.');
  const base = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
  return base + ext;
}
