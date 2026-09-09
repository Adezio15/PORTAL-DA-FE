import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('painel edita texto, preserva imagens antigas, substitui e exclui depois de salvar', async () => {
  const routes = new Map();
  const app = { use() {}, get(route, ...handlers) { routes.set(`GET ${route}`, handlers.at(-1)); }, post(route, ...handlers) { routes.set(`POST ${route}`, handlers.at(-1)); } };
  const express = Object.assign(() => app, { urlencoded() {}, json() {}, static() {} });
  const data = { info: {}, news: [{ id: 'old', title: 'Antigo', text: 'Texto', category: 'Fe', date: '2020-01-01', images: ['/uploads/old.jpg', 'https://example.com/a.jpg'] }], photos: [{ id: 'photo', title: 'Foto', url: 'https://example.com/photo.jpg', caption: 'Antes' }], videos: [{ id: 'video', title: 'Vídeo', url: 'https://www.youtube.com/embed/abc', description: 'Antes' }], comments: [] };
  const deleted = [];
  const context = { express, crypto, path, fileURLToPath, process, console, Buffer, URL,
    readData: async () => data,
    updatePhoto: async item => Object.assign(data.photos.find(p => p.id === item.id), item),
    updateVideo: async item => Object.assign(data.videos.find(p => p.id === item.id), item),
    addComment: async item => {
      if (!data.news.some(n => n.id === item.newsId)) return false;
      data.comments.push({ ...item, news_id: item.newsId, date: '2026-01-01' });
      return true;
    },
    deleteComment: async id => { data.comments = data.comments.filter(c => c.id !== id); },
    addNews: async item => data.news.push(item),
    updateNews: async item => Object.assign(data.news.find(n => n.id === item.id), item),
    deleteContent: async (type, id) => { data[type] = data[type].filter(n => n.id !== id); },
    saveUploadedImage: async value => value ? 'https://example.com/new.jpg' : '',
    removeCloudinaryImage: async url => { assert.ok(!data.news.some(n => n.images.includes(url))); deleted.push(url); }
  };
  let source = await fs.readFile(new URL('../server.js', import.meta.url), 'utf8');
  source = source.replaceAll('\r\n', '\n');
  source = source.replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/gm, '').replace('import.meta.url', JSON.stringify(new URL('../server.js', import.meta.url).href));
  source = source.slice(0, source.lastIndexOf('\ninitializeDatabase()'));
  vm.runInNewContext(source, context);
  const response = { redirect(statusOrUrl, url) { this.location = url || statusOrUrl; }, send(value) { this.html = value; }, sendStatus(value) { this.statusCode = value; }, status(value) { this.statusCode = value; return this; } };
  const next = error => { throw error; };
  await routes.get('GET /admin')({ query: { type: 'photos', edit: 'photo' } }, response);
  assert.match(response.html, /Editar foto/);
  await routes.get('POST /admin/photos/edit')({ body: { id: 'photo', title: 'Nova foto', url: 'https://example.com/other.jpg', text: 'Depois' } }, response, next);
  assert.equal(data.photos[0].caption, 'Depois');
  assert.equal(data.photos[0].url, 'https://example.com/other.jpg');
  await routes.get('POST /admin/videos/edit')({ body: { id: 'video', title: 'Novo vídeo', url: 'https://youtu.be/xyz', text: 'Descrição nova' } }, response, next);
  assert.equal(data.videos[0].url, 'https://www.youtube.com/embed/xyz');
  assert.equal(data.videos[0].description, 'Descrição nova');
  const comment = routes.get('POST /news/:id/comments');
  await comment({ params: { id: 'old' }, body: { author: ' ', text: ' ' } }, response, next);
  assert.equal(response.statusCode, 400);
  await comment({ params: { id: 'old' }, body: { author: 'Leitor', text: 'x'.repeat(2001) } }, response, next);
  assert.equal(data.comments.length, 0);
  await comment({ params: { id: 'missing' }, body: { author: 'Leitor', text: 'Olá' } }, response, next);
  assert.equal(response.statusCode, 404);
  await comment({ params: { id: 'old' }, body: { author: ' Leitor ', text: '<script>alert(1)</script>' } }, response, next);
  assert.equal(data.comments[0].author, 'Leitor');
  assert.equal(response.location, '/#comments-old');
  await routes.get('GET /')({}, response);
  assert.match(response.html, /&lt;script&gt;/);
  assert.doesNotMatch(response.html, /<script>alert/);
  await routes.get('POST /admin/comments/delete')({ body: { id: data.comments[0].id } }, response, next);
  assert.equal(data.comments.length, 0);
  deleted.length = 0;
  await routes.get('GET /admin')({ query: { edit: 'old' } }, response);
  assert.match(response.html, /Editar noticia/);
  assert.match(response.html, /\/uploads\/old.jpg/);
  await routes.get('POST /admin/news')({ body: { id: 'old', title: 'Novo', text: 'Editado' } }, response);
  assert.equal(data.news[0].text, 'Editado');
  assert.equal(data.news[0].images.length, 2);
  assert.equal(data.news[0].date, '2020-01-01');
  assert.equal(deleted.length, 0);
  await routes.get('POST /admin/news')({ body: { id: 'old', title: 'Novo', text: 'Editado', removeImages: '0' } }, response);
  assert.deepEqual(Array.from(data.news[0].images), ['https://example.com/a.jpg']);
  await routes.get('POST /admin/news')({ body: { id: 'old', title: 'Novo', text: 'Editado', imageData: 'image' } }, response);
  assert.equal(data.news[0].images[0], 'https://example.com/new.jpg');
  const originalUpload = context.saveUploadedImage;
  context.saveUploadedImage = async () => { throw new Error('Cloudinary indisponivel'); };
  await routes.get('POST /admin/news')({ body: { id: 'old', title: 'Novo', text: 'Editado', imageUrl: 'https://photos.google.com/share/example', imageData: 'image' } }, response);
  assert.equal(data.news[0].images[0], 'https://photos.google.com/share/example');
  const originalImage = 'https://www.tiktok.com/api/img/?itemId=7678401393496968469&location=0&aid=1988';
  const googleLink = 'https://www.google.com/imgres?q=NOSSA&imgurl=' + encodeURIComponent(originalImage);
  await routes.get('POST /admin/news')({ body: { id: 'old', title: 'Novo', text: 'Editado', imageUrl: googleLink, imageData: 'image' } }, response);
  assert.equal(data.news[0].images[0], originalImage);
  assert.equal(context.normalizeImageUrl('https://www.google.com/imgres?imgurl=javascript%3Aalert(1)'), '');
  assert.equal(context.normalizeImageUrl('https://www.google.com/imgres?q=sem-foto'), '');
  assert.equal(context.imageDisplayUrl(googleLink), originalImage);
  context.saveUploadedImage = originalUpload;
  await routes.get('POST /admin/delete')({ body: { type: 'news', id: 'old' } }, response);
  assert.equal(data.news.length, 0);
  assert.ok(deleted.includes('https://example.com/new.jpg'));
});
