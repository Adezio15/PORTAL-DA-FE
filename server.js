import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import {
  addNews,
  addPhoto,
  addVideo,
  deleteContent,
  initializeDatabase,
  readData,
  updateInfo
} from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'portal123';
const COOKIE_SECRET = process.env.COOKIE_SECRET || 'troque-este-segredo-no-render';
const SITE_NAME = 'Portal Católico da Fé';

app.use(express.urlencoded({ extended: true, limit: '12mb' }));
app.use(express.json({ limit: '12mb' }));
app.use(express.static(path.join(__dirname, 'public')));

async function saveUploadedImage(dataUrl = '') {
  if (!dataUrl) return '';

  const match = String(dataUrl).match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) throw new Error('Formato de imagem invalido.');

  const image = Buffer.from(match[2], 'base64');
  if (!image.length || image.length > 5 * 1024 * 1024) {
    throw new Error('A imagem deve ter no maximo 5 MB.');
  }

  const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
  const filename = `${crypto.randomUUID()}.${extensions[match[1]]}`;
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOADS_DIR, filename), image);
  return `/uploads/${filename}`;
}

async function removeUploadedImages(images = []) {
  await Promise.all(images
    .filter((url) => typeof url === 'string' && url.startsWith('/uploads/'))
    .map(async (url) => {
      const filename = path.basename(url);
      try {
        await fs.unlink(path.join(UPLOADS_DIR, filename));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }));
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeYouTubeUrl(url = '') {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.includes('youtube.com/embed/')) return trimmed;

  const watchMatch = trimmed.match(/[?&]v=([^&]+)/);
  if (watchMatch?.[1]) return `https://www.youtube.com/embed/${watchMatch[1]}`;

  const shortMatch = trimmed.match(/youtu\.be\/([^?&]+)/);
  if (shortMatch?.[1]) return `https://www.youtube.com/embed/${shortMatch[1]}`;

  return trimmed;
}

function normalizeImageUrl(value = '') {
  const trimmed = String(value).trim();
  if (!trimmed) return '';

  try {
    const url = new URL(trimmed);
    if (!['http:', 'https:'].includes(url.protocol)) return '';

    const driveMatch = url.pathname.match(/^\/file\/d\/([^/]+)/);
    if (url.hostname === 'drive.google.com' && driveMatch?.[1]) {
      return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(driveMatch[1])}`;
    }

    if (url.hostname === 'dropbox.com' || url.hostname === 'www.dropbox.com') {
      url.searchParams.set('raw', '1');
      return url.toString();
    }

    return url.toString();
  } catch {
    return '';
  }
}

function isGoogleUrl(value = '') {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === 'google.com' || hostname.endsWith('.google.com') || hostname.endsWith('.googleusercontent.com') || hostname === 'goo.gl' || hostname.endsWith('.goo.gl');
  } catch {
    return false;
  }
}

function imageDisplayUrl(value = '') {
  return isGoogleUrl(value) ? `/image-proxy?url=${encodeURIComponent(value)}` : value;
}

async function fetchGoogleImage(url, allowHtml = true) {
  const response = await fetch(url, { headers: { Accept: 'image/*, text/html;q=0.9' }, redirect: 'follow' });
  const contentType = response.headers.get('content-type') || '';
  const body = Buffer.from(await response.arrayBuffer());

  if (contentType.startsWith('image/')) return { body, contentType };
  if (!allowHtml || !contentType.includes('text/html')) return null;

  const html = body.toString('utf8');
  const imageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (!imageMatch?.[1]) return null;

  return fetchGoogleImage(new URL(imageMatch[1], response.url).toString(), false);
}

function signedValue(value) {
  const signature = crypto
    .createHmac('sha256', COOKIE_SECRET)
    .update(value)
    .digest('hex');
  return `${value}.${signature}`;
}

function isValidSignedValue(value = '') {
  const [payload, signature] = value.split('.');
  if (!payload || !signature) return false;
  const expected = signedValue(payload).split('.')[1];
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function getCookie(req, name) {
  const cookies = req.headers.cookie?.split(';').map((item) => item.trim()) || [];
  const match = cookies.find((item) => item.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : '';
}

function isAuthenticated(req) {
  return isValidSignedValue(getCookie(req, 'portal_admin'));
}

function requireAuth(req, res, next) {
  if (isAuthenticated(req)) return next();
  return res.redirect('/login');
}

function layout({ title, body, admin = false }) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Literata:wght@600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css">
  ${admin ? '<script src="/admin.js" defer></script>' : ''}
</head>
<body>
  <header class="topbar">
    <a class="brand" href="/">
      <img src="/logo.png" alt="${SITE_NAME}">
      <span>${SITE_NAME}</span>
    </a>
    <nav>
      <a href="/#noticias">Noticias</a>
      <a href="/#fotos">Fotos</a>
      <a href="/#videos">Videos</a>
      <a href="/#info">Catolicismo</a>
      <a class="admin-link" href="${admin ? '/logout' : '/admin'}">${admin ? 'Sair' : 'Admin'}</a>
    </nav>
  </header>
  ${body}
</body>
</html>`;
}

function renderHome(data) {
  const news = data.news
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map((item) => `
      <article class="news-card">
        <span>${escapeHtml(item.category || 'Noticia')}</span>
        <h3>${escapeHtml(item.title)}</h3>
        <time>${new Date(item.date).toLocaleDateString('pt-BR')}</time>
        <p>${escapeHtml(item.text)}</p>
        ${(item.images || []).length ? `
          <div class="news-images">
            ${(item.images || []).map((url, index) => `
              <img src="${escapeHtml(imageDisplayUrl(url))}" alt="${escapeHtml(item.title)} - foto ${index + 1}" loading="lazy" referrerpolicy="no-referrer">
            `).join('')}
          </div>
        ` : ''}
      </article>
    `)
    .join('');

  const photos = data.photos
    .map((item) => `
      <figure class="photo-card">
        <img src="${escapeHtml(imageDisplayUrl(item.url))}" alt="${escapeHtml(item.title)}" loading="lazy" referrerpolicy="no-referrer">
        <figcaption>
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.caption)}</span>
        </figcaption>
      </figure>
    `)
    .join('');

  const videos = data.videos
    .map((item) => `
      <article class="video-card">
        <iframe src="${escapeHtml(item.url)}" title="${escapeHtml(item.title)}" allowfullscreen loading="lazy"></iframe>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.description)}</p>
      </article>
    `)
    .join('');

  return layout({
    title: data.info.title,
    body: `
      <main>
        <section class="hero">
          <div class="hero-content">
            <img class="hero-logo" src="/logo.png" alt="${SITE_NAME}">
            <p class="eyebrow">Familia, fe e aprendizado</p>
            <h1>${escapeHtml(data.info.title)}</h1>
            <p>${escapeHtml(data.info.subtitle)}</p>
            <a class="primary-button" href="#noticias">Ver publicacoes</a>
          </div>
        </section>

        <section id="noticias" class="section">
          <div class="section-heading">
            <p>Atualizacoes</p>
            <h2>Noticias</h2>
          </div>
          <div class="news-grid">${news}</div>
        </section>

        <section id="fotos" class="section muted">
          <div class="section-heading">
            <p>Memorias</p>
            <h2>Fotos</h2>
          </div>
          <div class="photo-grid">${photos}</div>
        </section>

        <section id="videos" class="section">
          <div class="section-heading">
            <p>Conteudo</p>
            <h2>Videos</h2>
          </div>
          <div class="video-grid">${videos}</div>
        </section>

        <section id="info" class="section info-band">
          <div>
            <p class="eyebrow">Sobre o catolicismo</p>
            <h2>Informacoes e oracao</h2>
            <p>${escapeHtml(data.info.about)}</p>
          </div>
          <blockquote>${escapeHtml(data.info.prayer)}</blockquote>
        </section>
      </main>
      <footer>Feito para compartilhar a fe com carinho.</footer>
    `
  });
}

function formField({ label, name, type = 'text', value = '', textarea = false, required = true, accept = '' }) {
  const requiredAttr = required ? 'required' : '';
  if (textarea) {
    return `<label>${label}<textarea name="${name}" ${requiredAttr}>${escapeHtml(value)}</textarea></label>`;
  }
  const acceptAttr = accept ? `accept="${escapeHtml(accept)}"` : '';
  return `<label>${label}<input type="${type}" name="${name}" value="${escapeHtml(value)}" ${acceptAttr} ${requiredAttr}></label>`;
}

function renderAdmin(data) {
  const listItems = (items, type) => items.map((item) => `
    <li>
      <span>${escapeHtml(item.title)}</span>
      <form method="post" action="/admin/delete">
        <input type="hidden" name="type" value="${type}">
        <input type="hidden" name="id" value="${escapeHtml(item.id)}">
        <button type="submit">Remover</button>
      </form>
    </li>
  `).join('');

  return layout({
    title: `Painel - ${SITE_NAME}`,
    admin: true,
    body: `
      <main class="admin-page">
        <section class="admin-header">
          <div>
            <p class="eyebrow">Painel do site</p>
            <h1>Adicionar conteudo</h1>
          </div>
          <a class="primary-button" href="/">Ver site</a>
        </section>

        <section class="admin-grid">
          <form class="panel" method="post" action="/admin/info">
            <h2>Informacoes principais</h2>
            ${formField({ label: 'Titulo do site', name: 'title', value: data.info.title })}
            ${formField({ label: 'Subtitulo', name: 'subtitle', value: data.info.subtitle })}
            ${formField({ label: 'Texto sobre o catolicismo', name: 'about', value: data.info.about, textarea: true })}
            ${formField({ label: 'Oracao ou mensagem', name: 'prayer', value: data.info.prayer, textarea: true })}
            <button class="primary-button" type="submit">Salvar</button>
          </form>

          <form class="panel news-form" method="post" action="/admin/news">
            <h2>Nova noticia</h2>
            <p class="form-intro">Escreva a noticia e escolha uma foto do celular ou computador.</p>
            ${formField({ label: 'Titulo', name: 'title' })}
            ${formField({ label: 'Categoria', name: 'category', value: 'Catequese' })}
            ${formField({ label: 'Texto da noticia', name: 'text', textarea: true })}
            <label class="photo-picker">
              Foto da noticia <span class="optional">(opcional, ate 5 MB)</span>
              <input id="news-image-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif">
              <span class="file-button">Escolher foto</span>
              <span id="news-image-name" class="file-name">Nenhuma foto escolhida</span>
            </label>
            <div id="news-image-preview" class="image-preview" hidden>
              <img alt="Pre-visualizacao da foto">
              <button class="secondary-button" type="button" id="remove-news-image">Remover foto</button>
            </div>
            <input id="news-image-data" type="hidden" name="imageData">
            <details class="link-option">
              <summary>Usar link de imagem</summary>
              ${formField({ label: 'Link direto da foto', name: 'imageUrl', type: 'url', required: false })}
            </details>
            <p id="news-form-error" class="form-error" role="alert" hidden></p>
            <button class="primary-button" type="submit">Publicar</button>
          </form>

          <form class="panel" method="post" action="/admin/photos">
            <h2>Nova foto</h2>
            ${formField({ label: 'Titulo', name: 'title' })}
            ${formField({ label: 'Link direto da imagem', name: 'url', type: 'url' })}
            ${formField({ label: 'Legenda', name: 'caption', textarea: true })}
            <button class="primary-button" type="submit">Adicionar foto</button>
          </form>

          <form class="panel" method="post" action="/admin/videos">
            <h2>Novo video</h2>
            ${formField({ label: 'Titulo', name: 'title' })}
            ${formField({ label: 'Link do YouTube', name: 'url', type: 'url' })}
            ${formField({ label: 'Descricao', name: 'description', textarea: true })}
            <button class="primary-button" type="submit">Adicionar video</button>
          </form>
        </section>

        <section class="panel list-panel">
          <h2>Conteudos publicados</h2>
          <h3>Noticias</h3>
          <ul>${listItems(data.news, 'news')}</ul>
          <h3>Fotos</h3>
          <ul>${listItems(data.photos, 'photos')}</ul>
          <h3>Videos</h3>
          <ul>${listItems(data.videos, 'videos')}</ul>
        </section>
      </main>
    `
  });
}

app.get('/', async (req, res) => {
  const data = await readData();
  res.send(renderHome(data));
});

app.get('/image-proxy', async (req, res) => {
  const sourceUrl = normalizeImageUrl(req.query.url);
  if (!sourceUrl || !isGoogleUrl(sourceUrl)) return res.sendStatus(400);

  try {
    const image = await fetchGoogleImage(sourceUrl);
    if (!image) return res.sendStatus(404);
    res.set('Cache-Control', 'public, max-age=86400');
    res.type(image.contentType).send(image.body);
  } catch {
    res.sendStatus(502);
  }
});

app.get('/login', (req, res) => {
  res.send(layout({
    title: `Entrar - ${SITE_NAME}`,
    body: `
      <main class="login-page">
        <form class="panel login-card" method="post" action="/login">
          <img class="login-logo" src="/logo.png" alt="${SITE_NAME}">
          <p class="eyebrow">Administracao</p>
          <h1>Entrar no painel</h1>
          <label>Usuario<input type="text" name="username" required autofocus autocomplete="username"></label>
          <label>Senha<input type="password" name="password" required autocomplete="current-password"></label>
          <button class="primary-button" type="submit">Entrar</button>
        </form>
      </main>
    `
  }));
});

app.post('/login', (req, res) => {
  if (req.body.username !== ADMIN_USER || req.body.password !== ADMIN_PASSWORD) return res.redirect('/login');
  res.setHeader('Set-Cookie', `portal_admin=${encodeURIComponent(signedValue(ADMIN_USER))}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400`);
  res.redirect('/admin');
});

app.get('/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'portal_admin=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0');
  res.redirect('/');
});

app.get('/admin', requireAuth, async (req, res) => {
  const data = await readData();
  res.send(renderAdmin(data));
});

app.post('/admin/info', requireAuth, async (req, res) => {
  const data = await readData();
  await updateInfo({
    title: req.body.title?.trim() || data.info.title,
    subtitle: req.body.subtitle?.trim() || data.info.subtitle,
    about: req.body.about?.trim() || data.info.about,
    prayer: req.body.prayer?.trim() || data.info.prayer
  });
  res.redirect('/admin');
});

app.post('/admin/news', requireAuth, async (req, res) => {
  try {
    const uploadedImage = await saveUploadedImage(req.body.imageData);
    const linkedImage = normalizeImageUrl(req.body.imageUrl);
    await addNews({
      id: crypto.randomUUID(),
      title: req.body.title?.trim(),
      category: req.body.category?.trim() || 'Noticia',
      text: req.body.text?.trim(),
      images: [uploadedImage || linkedImage].filter(Boolean),
      date: new Date().toISOString()
    });
    res.redirect('/admin');
  } catch (error) {
    res.status(400).send(layout({
      title: `Erro - ${SITE_NAME}`,
      admin: true,
      body: `<main class="login-page"><section class="panel login-card"><h1>Nao foi possivel publicar</h1><p>${escapeHtml(error.message)}</p><a class="primary-button" href="/admin">Voltar ao painel</a></section></main>`
    }));
  }
});

app.post('/admin/photos', requireAuth, async (req, res) => {
  await addPhoto({
    id: crypto.randomUUID(),
    title: req.body.title?.trim(),
    url: normalizeImageUrl(req.body.url),
    caption: req.body.caption?.trim()
  });
  res.redirect('/admin');
});

app.post('/admin/videos', requireAuth, async (req, res) => {
  await addVideo({
    id: crypto.randomUUID(),
    title: req.body.title?.trim(),
    url: normalizeYouTubeUrl(req.body.url),
    description: req.body.description?.trim()
  });
  res.redirect('/admin');
});

app.post('/admin/delete', requireAuth, async (req, res) => {
  const data = await readData();
  const type = req.body.type;
  if (['news', 'photos', 'videos'].includes(type)) {
    const removedItem = data[type].find((item) => item.id === req.body.id);
    if (type === 'news' && removedItem) await removeUploadedImages(removedItem.images);
    await deleteContent(type, req.body.id);
  }
  res.redirect('/admin');
});

function safeDatabaseErrorMessage(error) {
  let message = String(error?.message || 'Erro desconhecido');
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return message;

  message = message.replaceAll(connectionString, '[credenciais omitidas]');
  try {
    const connection = new URL(connectionString);
    for (const secret of [connection.username, connection.password]) {
      if (secret) message = message.replaceAll(secret, '[omitido]');
    }
  } catch {
    // A mensagem original continuara sendo exibida, sem imprimir a variavel.
  }
  return message.replace(/postgres(?:ql)?:\/\/\S+/gi, '[credenciais omitidas]');
}

initializeDatabase()
  .then(() => {
    console.log('✅ Banco Neon conectado com sucesso');
    app.listen(PORT, () => {
      console.log(`${SITE_NAME} rodando em http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('❌ Erro ao conectar ao banco:', safeDatabaseErrorMessage(error));
    process.exit(1);
  });
