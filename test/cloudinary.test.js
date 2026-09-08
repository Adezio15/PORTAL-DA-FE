import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { saveUploadedImage, removeCloudinaryImage, managedPublicId } from '../cloudinary.js';

test('upload assinado, URL publica e exclusao restrita a arquivos do portal', async () => {
  const previous = { ...process.env };
  const originalFetch = globalThis.fetch;
  process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
  process.env.CLOUDINARY_API_KEY = 'test-key';
  process.env.CLOUDINARY_API_SECRET = 'test-secret';
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push(url);
    const body = options.body;
    assert.equal(body.get('api_key'), 'test-key');
    assert.equal(body.has('api_secret'), false);
    const keys = [...body.keys()].filter(key => !['file', 'api_key', 'signature'].includes(key)).sort();
    assert.equal(body.get('signature'), crypto.createHash('sha1').update(keys.map(key => `${key}=${body.get(key)}`).join('&') + 'test-secret').digest('hex'));
    return { ok: true, json: async () => url.endsWith('/upload') ? { secure_url: `https://res.cloudinary.com/test-cloud/image/upload/v123/${body.get('public_id')}.png` } : { result: 'ok' } };
  };
  try {
    const url = await saveUploadedImage('data:image/png;base64,aGVsbG8=');
    assert.ok(managedPublicId(url));
    await removeCloudinaryImage(url);
    assert.equal(calls.length, 2);
    for (const external of ['/uploads/old.png', 'https://example.com/a.png', url.replace('test-cloud', 'another-cloud'), url.replace('portal-da-fe/news', 'other')]) {
      assert.equal(managedPublicId(external), null);
      await removeCloudinaryImage(external);
    }
    assert.equal(calls.length, 2);
    await assert.rejects(saveUploadedImage('data:text/html;base64,aGVsbG8='), /Formato/);
    await assert.rejects(saveUploadedImage('data:image/png;base64,' + Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64')), /5 MB/);
    globalThis.fetch = async () => ({ ok: false, json: async () => ({ error: { message: 'test-secret' } }) });
    await assert.rejects(saveUploadedImage('data:image/png;base64,aGVsbG8='), error => !error.message.includes('test-secret') && error.message.includes('Cloudinary'));
    delete process.env.CLOUDINARY_API_SECRET;
    assert.equal(await saveUploadedImage(''), '');
    await assert.rejects(saveUploadedImage('data:image/png;base64,aGVsbG8='), /Configure/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
  }
});
