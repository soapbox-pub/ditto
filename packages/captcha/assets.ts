import { type Image, loadImage } from '@gfx/canvas-wasm';

export interface CaptchaImages {
  bgImages: Image[];
  puzzleMask: Image;
  puzzleHole: Image;
}

export async function getCaptchaImages(): Promise<CaptchaImages> {
  const bgImages = await getBackgroundImages();

  const puzzleMask = await loadImage(
    await Deno.readFile(new URL('./assets/puzzle/puzzle-mask.png', import.meta.url)),
  );
  const puzzleHole = await loadImage(
    await Deno.readFile(new URL('./assets/puzzle/puzzle-hole.png', import.meta.url)),
  );

  return { bgImages, puzzleMask, puzzleHole };
}

async function getBackgroundImages(): Promise<Image[]> {
  const path = new URL('./assets/bg/', import.meta.url);

  const images: Image[] = [];

  for await (const dirEntry of Deno.readDir(path)) {
    if (dirEntry.isFile && dirEntry.name.endsWith('.jpg')) {
      const file = await Deno.readFile(new URL(dirEntry.name, path));
      const image = await loadImage(file);
      images.push(image);
    }
  }

  return images;
}
