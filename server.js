import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'content.json');
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'portal123';
const COOKIE_SECRET = process.env.COOKIE_SECRET || 'troque-este-segredo-no-render';
const SITE_NAME = 'Portal Católico da Fé';

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    const initialData = {
      news: [
        {
          id: crypto.randomUUID(),
          title: 'Bem-vindo ao Portal Católico da Fé',
          date: new Date().toISOString(),
          text: 'Este espaco foi criado para publicar noticias, fotos, videos e aprendizados sobre o catolicismo.',
          category: 'Comunidade'
        }
      ],
      photos: [
        {
          id: crypto.randomUUID(),
          title: 'Nossa Senhora Aparecida',
          url: 'https://images.unsplash.com/photo-1529070538774-1843cb3265df?auto=format&fit=crop&w=1200&q=80',
          caption: 'Use imagens suas, da familia, da paroquia ou links publicos.'
        }
      ],
      videos: [
        {
          id: crypto.randomUUID(),
          title: 'Video de exemplo',
          url: 'https://www.youtube.com/embed/RQ2bS94b9g0',
          description: 'Cole links de incorporacao do YouTube para publicar videos.'
        }
      ],
      info: {
        title: SITE_NAME,
        subtitle: 'Noticias, fotos, videos e informacoes sobre o catolicismo',
        about: 'Um cantinho simples para registrar a fe catolica, aprender sobre santos, oracoes, liturgia e momentos importantes da comunidade.',
        prayer: 'Senhor, guiai nossos passos no amor, na verdade e na caridade.'
      }
    };
    await writeData(initialData);
  }
}

async function readData() {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, 'utf8');
  return JSON.parse(raw);
}

async function writeData(data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
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

function parseImageUrls(value = '') {
  return String(value)
    .split(/\r?\n|,/)
    .map((url) => url.trim())
    .filter(Boolean);
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
              <img src="${escapeHtml(url)}" alt="${escapeHtml(item.title)} - foto ${index + 1}" loading="lazy">
            `).join('')}
          </div>
        ` : ''}
      </article>
    `)
    .join('');

  const photos = data.photos
    .map((item) => `
      <figure class="photo-card">
        <img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.title)}" loading="lazy">
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

function formField({ label, name, type = 'text', value = '', textarea = false, required = true }) {
  const requiredAttr = required ? 'required' : '';
  if (textarea) {
    return `<label>${label}<textarea name="${name}" ${requiredAttr}>${escapeHtml(value)}</textarea></label>`;
  }
  return `<label>${label}<input type="${type}" name="${name}" value="${escapeHtml(value)}" ${requiredAttr}></label>`;
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

          <form class="panel" method="post" action="/admin/news">
            <h2>Nova noticia</h2>
            ${formField({ label: 'Titulo', name: 'title' })}
            ${formField({ label: 'Categoria', name: 'category', value: 'Catequese' })}
            ${formField({ label: 'Texto', name: 'text', textarea: true })}
            ${formField({ label: 'Links das fotos (um por linha)', name: 'images', textarea: true, required: false })}
            <button class="primary-button" type="submit">Publicar</button>
          </form>

          <form class="panel" method="post" action="/admin/photos">
            <h2>Nova foto</h2>
            ${formField({ label: 'Titulo', name: 'title' })}
            ${formField({ label: 'Link da imagem', name: 'url', type: 'url' })}
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
  data.info = {
    title: req.body.title?.trim() || data.info.title,
    subtitle: req.body.subtitle?.trim() || data.info.subtitle,
    about: req.body.about?.trim() || data.info.about,
    prayer: req.body.prayer?.trim() || data.info.prayer
  };
  await writeData(data);
  res.redirect('/admin');
});

app.post('/admin/news', requireAuth, async (req, res) => {
  const data = await readData();
  data.news.push({
    id: crypto.randomUUID(),
    title: req.body.title?.trim(),
    category: req.body.category?.trim() || 'Noticia',
    text: req.body.text?.trim(),
    images: parseImageUrls(req.body.images),
    date: new Date().toISOString()
  });
  await writeData(data);
  res.redirect('/admin');
});

app.post('/admin/photos', requireAuth, async (req, res) => {
  const data = await readData();
  data.photos.push({
    id: crypto.randomUUID(),
    title: req.body.title?.trim(),
    url: req.body.url?.trim(),
    caption: req.body.caption?.trim()
  });
  await writeData(data);
  res.redirect('/admin');
});

app.post('/admin/videos', requireAuth, async (req, res) => {
  const data = await readData();
  data.videos.push({
    id: crypto.randomUUID(),
    title: req.body.title?.trim(),
    url: normalizeYouTubeUrl(req.body.url),
    description: req.body.description?.trim()
  });
  await writeData(data);
  res.redirect('/admin');
});

app.post('/admin/delete', requireAuth, async (req, res) => {
  const data = await readData();
  const type = req.body.type;
  if (['news', 'photos', 'videos'].includes(type)) {
    data[type] = data[type].filter((item) => item.id !== req.body.id);
    await writeData(data);
  }
  res.redirect('/admin');
});

app.listen(PORT, () => {
  console.log(`${SITE_NAME} rodando em http://localhost:${PORT}`);
});
