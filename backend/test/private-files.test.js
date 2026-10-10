import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createPrivateFileStore } from '../src/private-files.js';

test('private storage keeps generated files outside the public root and rejects unsafe keys', async () => {
  const root = await mkdtemp(join(process.cwd(), 'test', '.private-test-'));
  const publicRoot = join(root, 'website');
  const privateRoot = join(root, 'private');
  try {
    await mkdir(publicRoot, { recursive: true });
    const store = createPrivateFileStore({ directory: privateRoot, publicRoot });
    const stored = await store.put(Buffer.from('private study material'), { contentType: 'application/pdf', fileName: '../../book.pdf' });
    assert.match(stored.key, /^[0-9a-f-]{36}$/i);
    assert.equal(stored.fileName, 'book.pdf');
    const opened = await store.open(stored.key);
    const parts = [];
    for await (const part of opened.stream) parts.push(part);
    assert.equal(Buffer.concat(parts).toString(), 'private study material');
    await assert.rejects(store.open('..\\website\\secret.pdf'), /invalid/);
    await store.remove(stored.key);
    await assert.rejects(store.open(stored.key));
    assert.throws(() => createPrivateFileStore({ directory: join(publicRoot, 'uploads'), publicRoot }), /outside/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
