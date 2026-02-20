import express from 'express';
import multer from 'multer';
import { put } from '@vercel/blob';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Prefer Vercel-style local env file, then fall back to .env
const localEnvResult = dotenv.config({ path: '.env.local' });
if (localEnvResult.error) {
  dotenv.config();
}

const app = express();
const port = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
const uploadNamePattern = /^(นาย|นาง|นางสาว)_[ก-๙]+_[ก-๙]+_\d{13}$/;

if (!blobToken) {
  console.warn('Missing BLOB_READ_WRITE_TOKEN. Uploads to Vercel Blob will fail until it is configured.');
}

function toBlobSafeFilename(originalname) {
  const { name, ext } = path.parse(originalname);
  const safeBase = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

  const finalBase = safeBase || 'file';
  const safeExt = ext.toLowerCase().replace(/[^a-z0-9.]/g, '') || '';
  return `${finalBase}${safeExt}`;
}

function recoverOriginalFilename(filename) {
  const candidates = [
    filename,
    filename.normalize('NFC'),
    Buffer.from(filename, 'latin1').toString('utf8'),
    Buffer.from(filename, 'latin1').toString('utf8').normalize('NFC'),
  ];

  for (const value of candidates) {
    const cleaned = value.trim();
    const { name } = path.parse(cleaned);
    if (uploadNamePattern.test(name)) {
      return cleaned;
    }
  }

  return filename;
}

function hasValidUploadFilename(originalname) {
  const recovered = recoverOriginalFilename(originalname);
  const { name } = path.parse(recovered);
  return uploadNamePattern.test(name);
}

// Configure multer to keep files in memory (buffer) and limit size
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4.5 * 1024 * 1024 }, // 4.5MB (Vercel Hobby plan limit)
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.jpg', '.jpeg', '.png', '.pdf'];
    if (allowed.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, or PDF files are allowed'));
    }
  },
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/upload', upload.single('file'), async (req, res) => {
  if (!blobToken) {
    return res.status(500).json({
      error: 'Server is missing BLOB_READ_WRITE_TOKEN. Set it in Vercel Project Settings > Environment Variables, then redeploy.',
    });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  if (!hasValidUploadFilename(req.file.originalname)) {
    return res.status(400).json({
      error: 'ชื่อไฟล์ไม่ถูกต้อง ต้องเป็นรูปแบบ คำนำหน้า_ชื่อ_นามสกุล_เลขบัตร13หลัก เช่น นาย_อยู่เย็น_เป็นใคร_1234567890123',
    });
  }

  try {
    const originalname = recoverOriginalFilename(req.file.originalname);
    const { mimetype, buffer } = req.file;
    const safeName = toBlobSafeFilename(originalname);
    const blobPath = `uploads/${Date.now()}-${safeName}`;

    const blob = await put(blobPath, buffer, {
      contentType: mimetype,
      access: 'public', // or 'private'
      token: blobToken,
    });

    res.status(200).json({
      name: safeName,
      originalName: originalname,
      url: blob.url,
      pathname: blob.pathname,
      contentType: blob.contentType,
      size: blob.size,
    });
  } catch (error) {
    console.error('Upload failed', error);
    res.status(500).json({ error: error.message });
  }
});

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Uploader listening on http://localhost:${port}`);
  });
}

export default app;
