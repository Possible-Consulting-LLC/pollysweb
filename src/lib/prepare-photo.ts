import { MAX_PHOTO_BYTES } from './upload-limits';

export class PhotoPreparationError extends Error {}

export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif';
export const PHOTO_HELP = 'JPEG, PNG, WebP, still GIF, or HEIC/HEIF. JPEG, PNG, WebP and HEIC/HEIF photos up to 25 MB are automatically prepared to fit 4 MB. GIF files must already be under 4 MB.';
type DecodedPhoto = {
  width: number; height: number;
  encode: (width: number, height: number, quality: number) => Promise<Blob>;
  close: () => void;
};
const isHeic = (file: File) => /\.(heic|heif)$/i.test(file.name) || /^image\/hei[cf]$/i.test(file.type);

async function decodePhoto(file: File): Promise<DecodedPhoto> {
  let source: Blob = file;
  if (isHeic(file)) {
    const { heicTo } = await import('heic-to');
    source = await heicTo({ blob: file, type: 'image/jpeg', quality: .95 });
  }
  const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
  return {
    width: bitmap.width, height: bitmap.height,
    close: () => bitmap.close(),
    encode: (width, height, quality) => new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) { reject(new Error('Photo preparation is unavailable in this browser.')); return; }
      // JPEG has no alpha channel. Preserve transparent areas against white.
      context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      canvas.toBlob(blob => {
        canvas.width = canvas.height = 0;
        if (blob) resolve(blob); else reject(new Error('Could not prepare this photo.'));
      }, 'image/jpeg', quality);
    }),
  };
}

export async function preparePhoto(file: File, decode = decodePhoto): Promise<File> {
  if (file.size > 25_000_000) throw new PhotoPreparationError('Choose a photo up to 25 MB for automatic preparation.');
  if (!file.size) throw new PhotoPreparationError('This photo is empty. Choose another photo.');
  const heic = isHeic(file);
  if (!heic && !/^image\/(jpeg|png|webp|gif)$/.test(file.type) && !/\.(jpe?g|png|webp|gif)$/i.test(file.name)) {
    throw new PhotoPreparationError('Choose a JPEG, PNG, WebP, still GIF, or HEIC/HEIF photo.');
  }
  if (!heic && file.size <= MAX_PHOTO_BYTES) return file;
  // Do not silently flatten animated GIFs; server validation checks small GIFs.
  if (file.type === 'image/gif' || /\.gif$/i.test(file.name)) {
    throw new PhotoPreparationError('For GIF files above 4 MB, export a single still image as JPEG or PNG first.');
  }
  const image = await decode(file);
  try {
    if (!image.width || !image.height || image.width * image.height > 100_000_000) {
      throw new PhotoPreparationError('This photo has too many pixels to prepare. Choose a smaller version.');
    }
    const scale = Math.min(1, 2560 / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    for (const quality of [.9, .8, .7, .6]) {
      const blob = await image.encode(width, height, quality);
      if (blob.size && blob.size <= MAX_PHOTO_BYTES) {
        return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: file.lastModified });
      }
    }
    throw new PhotoPreparationError('We couldn’t compress this photo enough. Choose a smaller version.');
  } finally { image.close(); }
}
