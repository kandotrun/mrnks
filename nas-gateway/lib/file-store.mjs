import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const SAFE_SEGMENT = /^[A-Za-z0-9._-]{1,255}$/;

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

export class FileStore {
  constructor(root) {
    this.root = path.resolve(root);
  }

  assertAssetId(assetId) {
    if (!SAFE_ID.test(String(assetId || ''))) throw httpError(400, 'invalid_asset_id');
  }

  resolveKey(key) {
    if (typeof key !== 'string' || key.startsWith('/') || key.includes('\\')) {
      throw httpError(400, 'invalid_storage_key');
    }
    const segments = key.split('/');
    if (segments.length < 2 || segments.some((segment) => !SAFE_SEGMENT.test(segment) || segment === '.' || segment === '..')) {
      throw httpError(400, 'invalid_storage_key');
    }
    const resolved = path.resolve(this.root, ...segments);
    if (!resolved.startsWith(`${this.root}${path.sep}`)) throw httpError(400, 'invalid_storage_key');
    return resolved;
  }

  uploadRoot(assetId) {
    this.assertAssetId(assetId);
    return path.join(this.root, '.uploads', assetId);
  }

  partPath(assetId, index) {
    if (!Number.isInteger(index) || index < 0 || index > 100_000) throw httpError(400, 'invalid_part_index');
    return path.join(this.uploadRoot(assetId), 'parts', `${String(index).padStart(6, '0')}.part`);
  }

  manifestPath(key) {
    return `${this.resolveKey(key)}.mrnks.json`;
  }

  async putPart(assetId, index, readable, expectedSize) {
    const destination = this.partPath(assetId, index);
    await mkdir(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.tmp-${randomUUID()}`;
    const output = createWriteStream(temporary, { flags: 'wx', mode: 0o600 });
    const hash = createHash('sha256');
    let size = 0;
    try {
      for await (const chunk of readable) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length;
        if (size > expectedSize) throw httpError(400, 'invalid_part_size');
        hash.update(bytes);
        if (!output.write(bytes)) await once(output, 'drain');
      }
      output.end();
      await once(output, 'finish');
      if (size !== expectedSize) throw httpError(400, 'invalid_part_size');
      await rename(temporary, destination);
      return { size, sha256: hash.digest('hex') };
    } catch (error) {
      output.destroy();
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async uploadedParts(assetId) {
    const directory = path.join(this.uploadRoot(assetId), 'parts');
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
    return entries
      .filter((entry) => entry.isFile() && /^\d{6}\.part$/.test(entry.name))
      .map((entry) => Number(entry.name.slice(0, 6)))
      .sort((a, b) => a - b);
  }

  async completeUpload(claims) {
    const destination = this.resolveKey(claims.key);
    const manifest = this.manifestPath(claims.key);
    try {
      const existing = JSON.parse(await readFile(manifest, 'utf8'));
      if (existing.assetId === claims.assetId && existing.sizeBytes === claims.sizeBytes) return existing;
    } catch (error) {
      if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    }

    await mkdir(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.tmp-${randomUUID()}`;
    const output = createWriteStream(temporary, { flags: 'wx', mode: 0o600 });
    const hash = createHash('sha256');
    let size = 0;
    try {
      for (let index = 0; index < claims.totalParts; index += 1) {
        const expectedPartSize = index === claims.totalParts - 1
          ? claims.sizeBytes - claims.chunkSizeBytes * (claims.totalParts - 1)
          : claims.chunkSizeBytes;
        const part = this.partPath(claims.assetId, index);
        let partStat;
        try {
          partStat = await stat(part);
        } catch (error) {
          if (error?.code === 'ENOENT') throw httpError(409, 'upload_incomplete');
          throw error;
        }
        if (partStat.size !== expectedPartSize) throw httpError(409, 'upload_incomplete');
        for await (const chunk of createReadStream(part)) {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          size += bytes.length;
          hash.update(bytes);
          if (!output.write(bytes)) await once(output, 'drain');
        }
      }
      output.end();
      await once(output, 'finish');
      if (size !== claims.sizeBytes) throw httpError(409, 'upload_incomplete');
      const sha256 = hash.digest('hex');
      await rename(temporary, destination);
      const result = { assetId: claims.assetId, key: claims.key, sizeBytes: size, sha256 };
      await writeFile(manifest, JSON.stringify(result), { mode: 0o600 });
      await rm(this.uploadRoot(claims.assetId), { recursive: true, force: true });
      return result;
    } catch (error) {
      output.destroy();
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async statObject(key) {
    try {
      return await stat(this.resolveKey(key));
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  }

  createReadStream(key, options = undefined) {
    return createReadStream(this.resolveKey(key), options);
  }

  async deleteObject(key) {
    const object = this.resolveKey(key);
    let existed = true;
    try {
      await unlink(object);
    } catch (error) {
      if (error?.code === 'ENOENT') existed = false;
      else throw error;
    }
    await rm(this.manifestPath(key), { force: true }).catch(() => undefined);
    return existed;
  }
}
