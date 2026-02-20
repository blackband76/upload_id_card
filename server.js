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

if (!blobToken) {
  console.warn('Missing BLOB_READ_WRITE_TOKEN. Uploads to Vercel Blob will fail until it is configured.');
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

  try {
    const { originalname, mimetype, buffer } = req.file;

    const blob = await put(`uploads/${Date.now()}-${originalname}`, buffer, {
      contentType: mimetype,
      access: 'public', // or 'private'
      token: blobToken,
    });

    res.status(200).json({
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
