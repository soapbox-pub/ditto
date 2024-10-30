import sharp from 'sharp';
import { encode } from 'blurhash';
import { encodeHex } from '@std/encoding/hex';
import type { Nip94MetadataOptional } from '@/interfaces/Nip94Metadata.ts';
import { Stickynotes } from '@soapbox/stickynotes';

const console = new Stickynotes('ditto:uploaders');

export function toByteArray(f: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('loadend', (m) => {
      if (m?.target?.result instanceof ArrayBuffer) {
        resolve(new Uint8Array(m.target.result));
      } else reject('Error loading file: readAsArrayBufferFailed');
    });
    reader.addEventListener('error', (e) => reject(e));
    reader.readAsArrayBuffer(f);
  });
}

export async function getOptionalNip94Metadata(f: File): Promise<Nip94MetadataOptional> {
  const tags: Nip94MetadataOptional = {};
  try {
    const buffer = await toByteArray(f);
    const hash = await crypto.subtle.digest('SHA-256', buffer).then(encodeHex);
    tags.x = tags.ox = hash;
    const img = sharp(buffer);
    const metadata = await img.metadata();

    if (metadata.width && metadata.height) {
      tags.dim = `${metadata.width}x${metadata.height}`;
      const pixels = await img
        .raw()
        .ensureAlpha()
        .toBuffer({ resolveWithObject: true })
        .then((buf) => {
          return new Uint8ClampedArray(buf.data);
        });
      tags.blurhash = encode(
        pixels,
        metadata.width,
        metadata.height,
        // sane default from https://github.com/woltapp/blurhash readme
        4,
        4,
      );
    }
  } catch (e) {
    console.error(`Error parsing ipfs metadata: ${e}`);
  }

  return tags;
}
