import crypto from 'node:crypto';

function configuration() {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const key = process.env.CLOUDINARY_API_KEY?.trim();
  const secret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!cloud || !key || !secret) throw new Error('Configure as variaveis CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET no servidor.');
  return { cloud, key, secret };
}

async function request(action, parameters, file) {
  const { cloud, key, secret } = configuration();
  const signed = { ...parameters, timestamp: String(Math.floor(Date.now() / 1000)) };
  const signature = crypto.createHash('sha1').update(Object.keys(signed).sort().map(key => `${key}=${signed[key]}`).join('&') + secret).digest('hex');
  const body = new FormData();
  for (const [name, value] of Object.entries({ ...signed, api_key: key, signature })) body.set(name, value);
  if (file) {
    const [header, encoded] = file.split(',');
    const mime = header.slice(5, header.indexOf(';'));
    body.set('file', new Blob([Buffer.from(encoded, 'base64')], { type: mime }), 'photo.' + mime.split('/')[1]);
  }
  let response;
  try {
    response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/image/${action}`, {
      method: 'POST', body, signal: AbortSignal.timeout(60000)
    });
  } catch (error) {
    throw new Error(error.name === 'TimeoutError' ? 'O Cloudinary demorou para responder. Tente enviar a foto novamente.' : 'Nao foi possivel conectar ao Cloudinary. Tente novamente.');
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) {
    const detail = String(result.error?.message || '');
    let reason = 'Falha no envio. Tente novamente.';
    if (/unknown api key|invalid api_key|invalid signature|api secret/i.test(detail) || [401, 403].includes(response.status)) reason = 'Verifique CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET no servidor; use as chaves do mesmo ambiente.';
    else if (/cloud name|cloud_name|disabled|deactivated/i.test(detail)) reason = 'Verifique CLOUDINARY_CLOUD_NAME e se a conta esta ativa.';
    else if (response.status === 429 || /quota|limit exceeded/i.test(detail)) reason = 'Limite de uso atingido. Verifique a cota da conta antes de tentar novamente.';
    else if (/invalid image|unsupported|image file/i.test(detail)) reason = 'Arquivo de imagem recusado. Escolha outra foto JPG, PNG, WEBP ou GIF.';
    else if (response.status >= 500) reason = 'Servico temporariamente indisponivel. Tente novamente em instantes.';
    throw new Error(`Cloudinary${response.status ? ` (HTTP ${response.status})` : ''}: ${reason}`);
  }
  return result;
}

export function managedPublicId(value) {
  try {
    const url = new URL(value);
    const prefix = `/${process.env.CLOUDINARY_CLOUD_NAME?.trim()}/image/upload/`;
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
