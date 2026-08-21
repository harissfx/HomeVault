require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const PORT = parseInt(process.env.PORT || "4000", 10);
const API_KEY = process.env.API_KEY;
const STORAGE_DIR = process.env.STORAGE_DIR || "./storage";
const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || "500", 10);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (!API_KEY) {
  console.error("API_KEY belum diisi di .env. Wajib diisi supaya API ini aman.");
  process.exit(1);
}

if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error("Origin tidak diizinkan oleh CORS"));
    },
  })
);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

app.use(express.json());

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token || token !== API_KEY) {
    return res.status(401).json({ error: "Unauthorized. Sertakan header Authorization: Bearer <API_KEY>" });
  }
  next();
}

function sanitizeFilename(name) {
  return path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
}

const META_PATH = path.join(STORAGE_DIR, ".meta.json");

function loadMeta() {
  try {
    return JSON.parse(fs.readFileSync(META_PATH, "utf-8"));
  } catch (err) {
    return {};
  }
}

function saveMeta(meta) {
  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2));
}

const ALBUMS_PATH = path.join(STORAGE_DIR, ".albums.json");

function loadAlbums() {
  try {
    return JSON.parse(fs.readFileSync(ALBUMS_PATH, "utf-8"));
  } catch (err) {
    return [];
  }
}

function saveAlbums(albums) {
  fs.writeFileSync(ALBUMS_PATH, JSON.stringify(albums, null, 2));
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, STORAGE_DIR),
  filename: (req, file, cb) => {
    const safeName = sanitizeFilename(file.originalname);
    const unique = `${Date.now()}-${safeName}`;
    cb(null, unique);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
});

app.get("/api/files", requireAuth, (req, res) => {
  try {
    const meta = loadMeta();
    const entries = fs.readdirSync(STORAGE_DIR, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile() && e.name !== ".meta.json" && e.name !== ".albums.json")
      .map((e) => {
        const filePath = path.join(STORAGE_DIR, e.name);
        const stat = fs.statSync(filePath);
        return {
          name: e.name,
          originalName: meta[e.name] || e.name.replace(/^\d+-/, ""),
          sizeBytes: stat.size,
          uploadedAt: stat.mtime,
        };
      })
      .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: "Gagal membaca daftar file", detail: err.message });
  }
});

app.post("/api/upload", requireAuth, upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Tidak ada file yang dikirim. Gunakan field bernama 'file'." });
  }

  const meta = loadMeta();
  meta[req.file.filename] = req.file.originalname;
  saveMeta(meta);

  res.json({
    message: "Upload berhasil",
    file: {
      name: req.file.filename,
      originalName: req.file.originalname,
      sizeBytes: req.file.size,
    },
  });
});

app.get("/api/files/:filename", requireAuth, (req, res) => {
  const safeName = sanitizeFilename(req.params.filename);
  const filePath = path.join(STORAGE_DIR, safeName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File tidak ditemukan" });
  }
  res.download(filePath);
});

app.delete("/api/files/:filename", requireAuth, (req, res) => {
  const safeName = sanitizeFilename(req.params.filename);
  const filePath = path.join(STORAGE_DIR, safeName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File tidak ditemukan" });
  }
  fs.unlinkSync(filePath);

  const meta = loadMeta();
  if (meta[safeName]) {
    delete meta[safeName];
    saveMeta(meta);
  }

  const albums = loadAlbums();
  let albumsChanged = false;
  albums.forEach((a) => {
    const before = a.fileNames.length;
    a.fileNames = a.fileNames.filter((n) => n !== safeName);
    if (a.fileNames.length !== before) albumsChanged = true;
  });
  if (albumsChanged) saveAlbums(albums);

  res.json({ message: "File berhasil dihapus" });
});

app.get("/api/albums", requireAuth, (req, res) => {
  try {
    res.json({ albums: loadAlbums() });
  } catch (err) {
    res.status(500).json({ error: "Gagal membaca daftar album", detail: err.message });
  }
});

app.post("/api/albums", requireAuth, (req, res) => {
  const { name, fileNames } = req.body || {};
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Nama album wajib diisi" });
  }
  if (!Array.isArray(fileNames) || fileNames.length === 0) {
    return res.status(400).json({ error: "Pilih minimal satu file buat dimasukkan ke album" });
  }

  const albums = loadAlbums();
  const album = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim(),
    fileNames: fileNames.map((n) => sanitizeFilename(n)),
    createdAt: new Date().toISOString(),
  };
  albums.push(album);
  saveAlbums(albums);

  res.json({ message: "Album dibuat", album });
});

app.patch("/api/albums/:id", requireAuth, (req, res) => {
  const albums = loadAlbums();
  const album = albums.find((a) => a.id === req.params.id);
  if (!album) {
    return res.status(404).json({ error: "Album tidak ditemukan" });
  }

  const { name, addFileNames, removeFileNames } = req.body || {};
  if (typeof name === "string" && name.trim()) {
    album.name = name.trim();
  }
  if (Array.isArray(addFileNames)) {
    const toAdd = addFileNames.map((n) => sanitizeFilename(n));
    album.fileNames = Array.from(new Set([...album.fileNames, ...toAdd]));
  }
  if (Array.isArray(removeFileNames)) {
    const toRemove = new Set(removeFileNames.map((n) => sanitizeFilename(n)));
    album.fileNames = album.fileNames.filter((n) => !toRemove.has(n));
  }

  saveAlbums(albums);
  res.json({ message: "Album diperbarui", album });
});

app.delete("/api/albums/:id", requireAuth, (req, res) => {
  const albums = loadAlbums();
  const next = albums.filter((a) => a.id !== req.params.id);
  if (next.length === albums.length) {
    return res.status(404).json({ error: "Album tidak ditemukan" });
  }
  saveAlbums(next);
  res.json({ message: "Album dihapus" });
});

app.get("/api/storage", requireAuth, (req, res) => {
  try {
    const entries = fs.readdirSync(STORAGE_DIR, { withFileTypes: true });
    const usedByFiles = entries
      .filter((e) => e.isFile() && e.name !== ".meta.json" && e.name !== ".albums.json")
      .reduce((sum, e) => sum + fs.statSync(path.join(STORAGE_DIR, e.name)).size, 0);
    if (typeof fs.statfsSync === "function") {
      const stats = fs.statfsSync(STORAGE_DIR);
      const totalBytes = stats.blocks * stats.bsize;
      const freeBytes = stats.bfree * stats.bsize;
      return res.json({
        usedByFiles,
        totalBytes,
        freeBytes,
        usedBytes: totalBytes - freeBytes,
      });
    }

    res.json({ usedByFiles, totalBytes: null, freeBytes: null, usedBytes: null });
  } catch (err) {
    res.status(500).json({ error: "Gagal membaca info penyimpanan", detail: err.message });
  }
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  if (err) {
    return res.status(500).json({ error: err.message });
  }
  next();
});

app.listen(PORT, () => {
  console.log(`Storage API jalan di port ${PORT}`);
  console.log(`Folder penyimpanan: ${STORAGE_DIR}`);
});