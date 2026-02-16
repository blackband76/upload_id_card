# Blob Uploader

Small Express app that lets a user upload an image or PDF (max 10MB) and stores it in Vercel Blob.

## Setup
1. Install deps: `npm install`
2. On Vercel, create a Blob store (Storage tab) and add the env var `BLOB_READ_WRITE_TOKEN` (or `BLOB_READ_WRITE_TOKEN_{env}`) as provided by Vercel. Locally, copy `.env.example` to `.env` and set `BLOB_READ_WRITE_TOKEN`.
3. Run the server locally: `npm start`
4. Visit `http://localhost:3000` and upload a file.

## Notes
- Allowed mime types: JPG, PNG, GIF, PDF.
- Size limit is set in `multer` to 10MB; adjust in `server.js` if needed.
- Files are uploaded under `uploads/{timestamp}-{originalname}`. Access can be `public` or `private` (set in `server.js`).
- For Vercel deployment, use this same server code in an API route or host as a serverless function; ensure the Blob token is available in the environment.
