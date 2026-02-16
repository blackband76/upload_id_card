import express from 'express';
import multer from 'multer';
import { put } from '@vercel/blob';
import dotenv from 'dotenv';

// Load env vars from .env if present
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Configure multer to keep files in memory (buffer) and limit size
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, or PDF files are allowed'));
    }
  },
});

app.use(express.static('public'));

app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const { originalname, mimetype, buffer } = req.file;

    const blob = await put(`uploads/${Date.now()}-${originalname}`, buffer, {
      contentType: mimetype,
      access: 'public', // or 'private'
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

app.listen(port, () => {
  console.log(`Uploader listening on http://localhost:${port}`);
});
