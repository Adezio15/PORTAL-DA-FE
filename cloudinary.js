import crypto from 'node:crypto';

function configuration() {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud || !key || !secret) throw new Error('Configure as variaveis CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET no servidor.');
  return { cloud, key, secret };
}

async function request(action, parameters, file) {
  const { cloud, key, secret } = configuration();
  const signed = { ...parameters, timestamp: String(Math.floor(Date.now() / 1000)) };
  const signature = crypto.createHash('sha1').update(Object.keys(signed).sort().map(key => `${key}=${signed[key]}`).join('&') + secret).digest('hex');
  const body = new URLSearchParams({ ...signed, api_key: key, signature });
  if (file) body.set('file', file);
  try {
    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/image/${action}`, {
      method: 'POST', body, signal: AbortSignal.timeout(60000)
    });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error();
    return result;
  } catch {
    throw new Error('Nao foi possivel concluir a operacao no Cloudinary. Tente novamente.');
  }
}

export function managedPublicId(value) {
  try {
    const url = new URL(value);
    const prefix = `/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/`;
    if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || !url.pathname.startsWith(prefix)) return null;
    const match = url.pathname.slice(prefix.length).match(/^v\d+\/(portal-da-fe\/news\/[a-f0-9-]{36})\.[a-z0-9]+$/);
    return match?.[1] || null;
  } catch { return null; }
}

export async function saveUploadedImage(dataUrl = '') {
  if (!dataUrl) return '';
  const match = String(dataUrl).match(/^data:image\/(?:jpeg|png|webp|gif);base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) throw new Error('Formato de imagem invalido.');
  const image = Buffer.from(match[1], 'base64');
  if (!image.length || image.length > 5 * 1024 * 1024) throw new Error('A imagem deve ter no maximo 5 MB.');
  const publicId = `portal-da-fe/news/${crypto.randomUUID()}`;
  const result = await request('upload', { public_id: publicId, overwrite: 'false' }, dataUrl);
  if (managedPublicId(result.secure_url) !== publicId) throw new Error('O Cloudinary retornou uma URL de imagem inesperada.');
  return result.secure_url;
}

export async function removeCloudinaryImage(url) {
  const publicId = managedPublicId(url);
  if (!publicId) return;
  const result = await request('destroy', { public_id: publicId, invalidate: 'true' });
  if (!['ok', 'not found'].includes(result.result)) throw new Error('Nao foi possivel excluir a imagem no Cloudinary.');
}
