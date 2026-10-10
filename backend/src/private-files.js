import { createReadStream } from 'node:fs';
import { chmodSync, mkdirSync, realpathSync } from 'node:fs';
import { mkdir, open, rename, rm, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';

const CONTENT_TYPES = new Set(['application/pdf', 'application/epub+zip', 'application/zip', 'application/octet-stream']);

export function createPrivateFileStore({ directory, publicRoot }) {
  if (!directory || !isAbsolute(directory)) throw new Error('PRIVATE_FILES_DIR must be an absolute path outside the public website directory.');
  const root = resolve(directory);
  const lexicalRelative = relative(resolve(publicRoot), root);
  if (!lexicalRelative.startsWith('..') && lexicalRelative !== '..' && !isAbsolute(lexicalRelative)) {
    throw new Error('PRIVATE_FILES_DIR must be outside the public website directory.');
  }
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const canonicalPublicRoot = realpathSync(resolve(publicRoot));
  const canonicalRoot = realpathSync(root);
  const relativeToPublic = relative(canonicalPublicRoot, canonicalRoot);
  if (!relativeToPublic.startsWith('..') && relativeToPublic !== '..' && !isAbsolute(relativeToPublic)) {
    throw new Error('PRIVATE_FILES_DIR must be outside the public website directory.');
  }
  if (process.platform !== 'win32') chmodSync(root, 0o700);

  function pathFor(key) {
    if (typeof key !== 'string' || !/^[0-9a-f-]{36}$/i.test(key)) throw new Error('Private file reference is invalid.');
    const target = resolve(root, key);
    if (!target.startsWith(`${root}${sep}`)) throw new Error('Private file reference is invalid.');
    return target;
  }

  return {
    async put(buffer, { contentType, fileName }) {
      if (!Buffer.isBuffer(buffer) || buffer.length < 1) throw Object.assign(new Error('Digital file must not be empty.'), { statusCode: 400 });
      if (buffer.length > 50 * 1024 * 1024) throw Object.assign(new Error('Digital file exceeds the 50 MB upload limit.'), { statusCode: 413 });
      if (!CONTENT_TYPES.has(contentType)) throw Object.assign(new Error('Only PDF, EPUB, ZIP, or binary downloads are accepted.'), { statusCode: 400 });
      await mkdir(root, { recursive: true, mode: 0o700 });
      const key = randomUUID();
      const target = pathFor(key);
      const temporary = `${target}.${randomUUID()}.tmp`;
      const handle = await open(temporary, 'wx', 0o600);
      try {
        await handle.writeFile(buffer);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, target);
      return { key, contentType, fileName: sanitizeFileName(fileName), size: buffer.length };
    },
    async open(key) {
      const path = pathFor(key);
      const details = await stat(path);
      if (!details.isFile()) throw new Error('Private file is not available.');
      return { stream: createReadStream(path), size: details.size };
    },
    async remove(key) {
      await rm(pathFor(key), { force: true });
    },
  };
}

export function sanitizeFileName(value) {
  const name = String(value ?? 'download').split(/[\\/]/).at(-1).replace(/[\r\n"\\]/g, '_').trim().slice(0, 180);
  return name || 'download';
}
