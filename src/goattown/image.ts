import { assertImagesWithin } from '@criblio/app-utils/goattown';
import type { ImageInputContract, MessageImage } from '@criblio/app-utils/goattown';

export interface PreparedPhoto {
  dataUrl: string;
  image: MessageImage;
  width: number;
  height: number;
  sourceName: string;
}

function canvasType(limits: ImageInputContract): string {
  for (const preferred of ['image/jpeg', 'image/webp', 'image/png']) {
    if (limits.mimeTypes.includes(preferred)) return preferred;
  }
  throw new Error(`This agent accepts ${limits.mimeTypes.join(', ') || 'no image types'}; no supported browser image encoder is available.`);
}

export async function preparePhoto(file: File, limits: ImageInputContract): Promise<PreparedPhoto> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file to classify.');
  if (limits.maxImages < 1) throw new Error('This GoatTown service does not accept images.');
  const bitmap = await createImageBitmap(file);
  try {
    const mimeType = canvasType(limits);
    let scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    let quality = 0.88;
    for (let attempt = 0; attempt < 18; attempt += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Your browser could not prepare this image.');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL(mimeType, quality);
      const data = dataUrl.slice(dataUrl.indexOf(',') + 1);
      const image = { data, mimeType };
      try {
        assertImagesWithin([image], limits);
        return { dataUrl, image, width: canvas.width, height: canvas.height, sourceName: file.name };
      } catch {
        if (quality > 0.58 && mimeType !== 'image/png') quality -= 0.1;
        else scale *= 0.78;
      }
    }
    throw new Error('This photo is still larger than the image limit after compression. Choose a smaller photo.');
  } finally {
    bitmap.close();
  }
}
