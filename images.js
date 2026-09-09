import crypto from 'node:crypto';

export function parseImage(dataUrl) {
  const match = String(dataUrl).match(/^data:image\/(jpeg|png|webp|gif|avif|bmp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) throw new Error('Formato de imagem invalido. Use JPG, PNG, WEBP, GIF, AVIF ou BMP.');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error('A imagem deve ter no maximo 5 MB.');
  const type = match[1];
  const valid = {
    jpeg: bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])),
    png: bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    gif: ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6)),
    webp: bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP',
    bmp: bytes.toString('ascii', 0, 2) === 'BM',
    avif: bytes.toString('ascii', 4, 8) === 'ftyp' && /avif|avis/.test(bytes.toString('ascii', 8, 40))
  }[type];
  if (!valid) throw new Error('Formato de imagem invalido. Escolha um arquivo de foto valido.');
  return { mime: `image/${type}`, base64: bytes.toString('base64') };
}

export async function saveUploadedImage(dataUrl = '', storeImage) {
  if (!dataUrl) return '';
  const image = parseImage(dataUrl);
  const id = crypto.randomUUID();
  await storeImage({ id, ...image });
  return `/media/${id}`;
}
