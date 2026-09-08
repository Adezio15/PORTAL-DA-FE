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
  const data = { info: {}, news: [{ id: 'old', title: 'Antigo', text: 'Texto', category: 'Fe', date: '2020-01-01', images: ['/uploads/old.jpg', 'https://example.com/a.jpg'] }], photos: [], videos: [] };
  const deleted = [];
  const context = { express, crypto, path, fileURLToPath, process, console, Buffer, URL,
    readData: async () => data,
    addNews: async item => data.news.push(item),
    updateNews: async item => Object.assign(data.news.find(n => n.id === item.id), item),
    deleteContent: async (type, id) => { data[type] = data[type].filter(n => n.id !== id); },
    saveUploadedImage: async value => value ? 'https://example.com/new.jpg' : '',
    removeCloudinaryImage: async url => { assert.ok(!data.news.some(n => n.images.includes(url))); deleted.push(url); }
  };
  let source = await fs.readFile(new URL('../server.js', import.meta.url), 'utf8');
  source = source.replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/gm, '').replace('import.meta.url', JSON.stringify(new URL('../server.js', import.meta.url).href));
  source = source.slice(0, source.lastIndexOf('\ninitializeDatabase()'));
  vm.runInNewContext(source, context);
  const response = { redirect(url) { this.location = url; }, send(value) { this.html = value; }, sendStatus(value) { this.statusCode = value; }, status(value) { this.statusCode = value; return this; } };
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
  await routes.get('POST /admin/delete')({ body: { type: 'news', id: 'old' } }, response);
  assert.equal(data.news.length, 0);
  assert.ok(deleted.includes('https://example.com/new.jpg'));
});
