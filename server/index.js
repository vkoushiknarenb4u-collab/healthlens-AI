import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { answerReportQuestion, analyzePdf } from './gemini.js';
import { createReportSession, deleteReportSession, getReportSession } from './report-sessions.js';

const app = express();
const port = Number(process.env.PORT) || 3000;
const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, '..', 'public');
const maxUploadBytes = 15 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxUploadBytes, files: 1, fields: 2 },
  fileFilter(_req, file, callback) {
    const hasPdfName = path.extname(file.originalname).toLowerCase() === '.pdf';
    const isPdfMime = file.mimetype === 'application/pdf' || file.mimetype === 'application/octet-stream';
    if (!hasPdfName || !isPdfMime) return callback(new Error('Upload a PDF report to continue.'));
    callback(null, true);
  }
});

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'no-referrer');
  next();
});
app.use(express.static(publicDir, { etag: true, maxAge: 0 }));

app.get('/api/status', (_req, res) => {
  res.json({ ready: Boolean(process.env.GEMINI_API_KEY), maxUploadBytes });
});

app.post('/api/analyze', upload.single('report'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Choose a PDF report first.' });
    if (req.file.size < 8 || req.file.buffer.subarray(0, 5).toString() !== '%PDF-') {
      return res.status(400).json({ error: 'This file does not look like a valid PDF.' });
    }
    const report = await analyzePdf(req.file.buffer);
    const sessionId = createReportSession(report);
    res.json({ report, sessionId });
  } catch (error) {
    next(error);
  }
});

app.post('/api/chat', async (req, res, next) => {
  try {
    const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : '';
    const report = getReportSession(sessionId);
    const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    if (!report) return res.status(410).json({ error: 'This report session has expired. Analyze the report again to continue.' });
    if (!question || question.length > 1200) return res.status(400).json({ error: 'Enter a question of up to 1,200 characters.' });
    const answer = await answerReportQuestion({ report, question, history });
    res.json({ answer });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/session/:id', (req, res) => {
  deleteReportSession(req.params.id);
  res.status(204).end();
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'The PDF is too large. The maximum size is 15 MB.' });
  }
  const status = Number(error.status) || (error.message?.startsWith('Upload a PDF') ? 400 : 500);
  if (status >= 500) {
    let cause = error.cause;
    for (let depth = 0; cause?.cause && depth < 3; depth += 1) cause = cause.cause;
    console.error('HealthLens request failed:', {
      status,
      upstreamStatus: error.upstreamStatus,
      name: cause?.name || error.name,
      code: typeof cause?.code === 'string' ? cause.code : undefined
    });
  }
  const message = error.publicMessage || (status >= 500
    ? 'Something went wrong while processing the report. Please try again.'
    : error.message);
  res.status(status).json({ error: message });
});

app.listen(port, '127.0.0.1', () => {
  console.log(`HealthLens AI is running at http://127.0.0.1:${port}`);
});
