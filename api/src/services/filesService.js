import path from "node:path";
import { filesRepo } from "../repositories/filesRepo.js";
import { createLocalFileStorage } from "./fileStorages/localFileStorage.js";

function normalizeExtension(fileName) {
  const ext = path.extname(String(fileName || "")).trim().replace(/^\./, "").toLowerCase();
  return ext || null;
}

export function createFilesService({ db, config, logger = console } = {}) {
  const repo = filesRepo(db);

  const localStorage = createLocalFileStorage({
    rootDir: config.FILES_LOCAL_DIR,
  });

  function resolveStorage(driver) {
    if (driver === "local") return localStorage;
    throw new Error(`files_storage_driver_not_supported:${driver}`);
  }

  function activeDriver() {
    return String(config.FILES_STORAGE_DRIVER || "local").trim().toLowerCase() || "local";
  }

  async function upload({ fileName, contentType, buffer, uploadedBy } = {}) {
    if (!fileName) throw new Error("files_file_name_required");
    if (!contentType) throw new Error("files_content_type_required");
    if (!Buffer.isBuffer(buffer)) throw new Error("files_buffer_required");

    const driver = activeDriver();
    const storage = resolveStorage(driver);
    const stored = await storage.save({ fileName, contentType, buffer });

    const row = await repo.create({
      file_name: String(fileName),
      content_type: String(contentType),
      size: buffer.length,
      extension: stored.extension || normalizeExtension(fileName),
      storage_driver: stored.storageDriver,
      storage_path: stored.storagePath,
      storage_bucket: stored.storageBucket,
      uploaded_by: uploadedBy ?? null,
    });

    logger?.info?.({ fileId: row.id, storageDriver: row.storage_driver }, "file uploaded");
    return row;
  }

  async function metadata(id) {
    const row = await repo.findById(id);
    if (!row) throw new Error("file_not_found");
    return row;
  }

  async function download(id, { responseType = "buffer" } = {}) {
    const row = await metadata(id);
    const storage = resolveStorage(row.storage_driver);

    if (!(await storage.exists(row.storage_path))) {
      throw new Error("file_blob_not_found");
    }

    if (responseType === "stream") {
      return {
        file: row,
        stream: storage.createReadStream(row.storage_path),
      };
    }

    return {
      file: row,
      buffer: await storage.readBuffer(row.storage_path),
    };
  }

  return {
    upload,
    metadata,
    download,
  };
}
