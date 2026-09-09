import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INITIAL_DATA_FILE = path.join(__dirname, 'data', 'content.json');
const SCHEMA_FILE = path.join(__dirname, 'database', 'schema.sql');

let sql;

function database() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL nao configurada. Copie a string de conexao do Neon para essa variavel de ambiente.');
  }
  sql ||= neon(process.env.DATABASE_URL);
  return sql;
}

export async function initializeDatabase() {
  const db = database();
  const schema = await fs.readFile(SCHEMA_FILE, 'utf8');
  for (const statement of schema.split(';').map((item) => item.trim()).filter(Boolean)) {
    await db.query(statement);
  }

  const [{ count }] = await db`SELECT COUNT(*)::int AS count FROM site_info`;
  if (count > 0) return;

  const initial = JSON.parse(await fs.readFile(INITIAL_DATA_FILE, 'utf8'));
  await db`
    INSERT INTO site_info (id, title, subtitle, about, prayer)
    VALUES (1, ${initial.info.title}, ${initial.info.subtitle}, ${initial.info.about}, ${initial.info.prayer})
    ON CONFLICT (id) DO NOTHING
  `;

  for (const item of initial.news) await addNews(item);
  for (const item of initial.photos) await addPhoto(item);
  for (const item of initial.videos) await addVideo(item);
}

export async function readData() {
  const db = database();
  const [infoRows, newsRows, imageRows, photos, videos, comments] = await db.transaction([
    db`SELECT title, subtitle, about, prayer FROM site_info WHERE id = 1`,
    db`SELECT id, title, category, body AS text, published_at AS date FROM news ORDER BY published_at DESC`,
    db`SELECT news_id, url FROM news_images ORDER BY position`,
    db`SELECT id, title, url, caption FROM photos ORDER BY created_at`,
    db`SELECT id, title, url, description FROM videos ORDER BY created_at`,
    db`SELECT id, news_id, author, body AS text, created_at AS date FROM comments ORDER BY created_at`
  ], { readOnly: true });

  const imagesByNews = new Map();
  for (const image of imageRows) {
    const images = imagesByNews.get(image.news_id) || [];
    images.push(image.url);
    imagesByNews.set(image.news_id, images);
  }

  return {
    info: infoRows[0],
    news: newsRows.map((item) => ({ ...item, images: imagesByNews.get(item.id) || [] })),
    photos,
    videos,
    comments
  };
}

export async function updateInfo(info) {
  const db = database();
  await db`
    INSERT INTO site_info (id, title, subtitle, about, prayer, updated_at)
    VALUES (1, ${info.title}, ${info.subtitle}, ${info.about}, ${info.prayer}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title, subtitle = EXCLUDED.subtitle, about = EXCLUDED.about,
      prayer = EXCLUDED.prayer, updated_at = NOW()
  `;
}

export async function addNews(item) {
  const db = database();
  const queries = [db`
    INSERT INTO news (id, title, category, body, published_at)
    VALUES (${item.id}, ${item.title}, ${item.category || 'Noticia'}, ${item.text}, ${item.date || new Date().toISOString()})
    ON CONFLICT (id) DO NOTHING
  `];
  for (const [position, url] of (item.images || []).entries()) {
    queries.push(db`
      INSERT INTO news_images (news_id, url, position)
      VALUES (${item.id}, ${url}, ${position})
      ON CONFLICT (news_id, position) DO NOTHING
    `);
  }
  await db.transaction(queries);
}

export async function addPhoto(item) {
  const db = database();
  await db`
    INSERT INTO photos (id, title, url, caption)
    VALUES (${item.id}, ${item.title}, ${item.url}, ${item.caption || ''})
    ON CONFLICT (id) DO NOTHING
  `;
}

export async function addVideo(item) {
  const db = database();
  await db`
    INSERT INTO videos (id, title, url, description)
    VALUES (${item.id}, ${item.title}, ${item.url}, ${item.description || ''})
    ON CONFLICT (id) DO NOTHING
  `;
}

export async function deleteContent(type, id) {
  const db = database();
  if (type === 'news') return db`DELETE FROM news WHERE id = ${id}`;
  if (type === 'photos') return db`DELETE FROM photos WHERE id = ${id}`;
  if (type === 'videos') return db`DELETE FROM videos WHERE id = ${id}`;
}

export async function updateNews(item) {
  const db = database();
  await db.transaction([
    db`UPDATE news SET title = ${item.title}, category = ${item.category}, body = ${item.text} WHERE id = ${item.id}`,
    db`DELETE FROM news_images WHERE news_id = ${item.id}`,
    ...item.images.map((url, position) => db`INSERT INTO news_images (news_id, url, position) VALUES (${item.id}, ${url}, ${position})`)
  ]);
}

export async function updatePhoto(item) {
  const db = database();
  await db`UPDATE photos SET title = ${item.title}, url = ${item.url}, caption = ${item.caption} WHERE id = ${item.id}`;
}

export async function updateVideo(item) {
  const db = database();
  await db`UPDATE videos SET title = ${item.title}, url = ${item.url}, description = ${item.description} WHERE id = ${item.id}`;
}

export async function addComment(item) {
  const db = database();
  const rows = await db`INSERT INTO comments (id, news_id, author, body)
    SELECT ${item.id}, id, ${item.author}, ${item.text} FROM news WHERE id = ${item.newsId}
    RETURNING id`;
  return rows.length > 0;
}

export async function deleteComment(id) {
  const db = database();
  await db`DELETE FROM comments WHERE id = ${id}`;
}
