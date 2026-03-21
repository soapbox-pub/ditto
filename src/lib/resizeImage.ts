/** Maximum dimension (width or height) for resized images. */
const MAX_DIMENSION = 1920;

/** JPEG quality for resized images (0–1). */
const JPEG_QUALITY = 0.85;

interface ResizedImage {
  /** The resized image as a JPEG File. */
  file: File;
  /** Pixel dimensions string, e.g. "1920x1080". */
  dimensions: string;
}

/**
 * Resize an image file so its longest side is at most {@link MAX_DIMENSION}
 * pixels, and convert it to JPEG.
 *
 * If the image is already within the size limit **and** is already JPEG, the
 * original file is returned as-is (no quality loss from re-encoding).
 */
export async function resizeImage(file: File): Promise<ResizedImage> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  const alreadySmall = width <= MAX_DIMENSION && height <= MAX_DIMENSION;
  const alreadyJpeg = file.type === 'image/jpeg';

  if (alreadySmall && alreadyJpeg) {
    bitmap.close();
    return {
      file,
      dimensions: `${width}x${height}`,
    };
  }

  // Compute scaled dimensions, preserving aspect ratio.
  let newWidth = width;
  let newHeight = height;

  if (!alreadySmall) {
    const scale = MAX_DIMENSION / Math.max(width, height);
    newWidth = Math.round(width * scale);
    newHeight = Math.round(height * scale);
  }

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

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to encode JPEG'))),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });

  const resizedFile = new File([blob], replaceExtension(file.name, '.jpg'), {
    type: 'image/jpeg',
  });

  return {
    file: resizedFile,
    dimensions: `${newWidth}x${newHeight}`,
  };
}

/** Replace or append a file extension. */
function replaceExtension(filename: string, ext: string): string {
  const dotIndex = filename.lastIndexOf('.');
  const base = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
  return base + ext;
}
