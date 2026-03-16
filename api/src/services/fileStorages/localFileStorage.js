import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

function normalizeExtension(fileName) {
  const ext = path.extname(String(fileName || "")).trim().replace(/^\./, "").toLowerCase();
  return ext || null;
}

export function createLocalFileStorage({ rootDir }) {
  async function ensureRootDir() {
    await fsp.mkdir(rootDir, { recursive: true });
  }

  async function save({ fileName, buffer }) {
    await ensureRootDir();

    const extension = normalizeExtension(fileName);
    const partition = new Date().toISOString().slice(0, 10).replace(/-/g, "/");
    const generatedName = extension ? `${randomUUID()}.${extension}` : randomUUID();
    const relativePath = path.posix.join(partition, generatedName);
    const absolutePath = path.join(rootDir, relativePath);

    await fsp.mkdir(path.dirname(absolutePath), { recursive: true });
    await fsp.writeFile(absolutePath, buffer);

    return {
      storageDriver: "local",
      storagePath: relativePath,
      storageBucket: null,
      extension,
    };
  }

  function resolvePath(storagePath) {
    return path.join(rootDir, storagePath);
  }

  async function exists(storagePath) {
    try {
      await fsp.access(resolvePath(storagePath));
      return true;
    } catch {
      return false;
    }
  }

  function createReadStream(storagePath) {
    return fs.createReadStream(resolvePath(storagePath));
  }

  async function readBuffer(storagePath) {
    return fsp.readFile(resolvePath(storagePath));
  }

  return {
    save,
    exists,
    createReadStream,
    readBuffer,
  };
}
