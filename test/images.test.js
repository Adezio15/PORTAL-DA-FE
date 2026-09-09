import test from 'node:test';
import assert from 'node:assert/strict';
import { parseImage, saveUploadedImage } from '../images.js';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGZkAAAAASUVORK5CYII=';

test('foto salva no banco sem acessar Cloudinary e gera URL propria', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Cloudinary HTTP 401'); };
  try {
    const rows = [];
    const first = await saveUploadedImage(png, async item => rows.push(item));
    const second = await saveUploadedImage(png, async item => rows.push(item));
    assert.match(first, /^\/media\/[a-f0-9-]{36}$/);
    assert.notEqual(first, second);
    assert.equal(rows[0].mime, 'image/png');
    assert.equal(rows[0].base64, png.split(',')[1]);
    assert.equal(first, `/media/${rows[0].id}`);
    assert.equal(await saveUploadedImage('', () => assert.fail()), '');
    await assert.rejects(saveUploadedImage(png, async () => { throw new Error('database failure'); }), /database failure/);
  } finally { globalThis.fetch = original; }
});

test('rejeita arquivos falsos, SVG e imagens acima do limite', () => {
  assert.throws(() => parseImage('data:image/png;base64,aGVsbG8='), /Formato/);
  assert.throws(() => parseImage('data:image/svg+xml;base64,PHN2Zz4='), /Formato/);
  assert.throws(() => parseImage('data:image/jpeg;base64,' + Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64')), /5 MB/);
});
