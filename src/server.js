'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { parseDmarcFile } = require('./parsers/dmarc');
const { parseMtaStsFile } = require('./parsers/mta-sts');
const store = require('./store');

const app = express();
const PORT = process.env.PORT || 3000;

const UPLOADS_DIR = path.join(__dirname, '../uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ─── Routes ──────────────────────────────────────────────────────────────────

// Upload & parse a report
app.post('/api/upload', upload.single('report'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const filePath = req.file.path;
  const filename = req.file.originalname;

  try {
    let parsed;
    const ext = path.extname(filename).toLowerCase();
    const lower = filename.toLowerCase();

    // Detect type: MTA-STS reports are JSON (or gzipped JSON)
    const isMtaSts =
      lower.includes('tlsrpt') ||
      lower.includes('mta-sts') ||
      lower.includes('tls-report') ||
      ext === '.json';

    if (isMtaSts) {
      parsed = await parseMtaStsFile(filePath);
    } else {
      // Default to DMARC (XML / ZIP / GZ)
      try {
        parsed = await parseDmarcFile(filePath);
      } catch (dmarcErr) {
        // Fallback: try MTA-STS
        parsed = await parseMtaStsFile(filePath);
      }
    }

    const report = store.addReport(parsed, filename);
    fs.unlinkSync(filePath); // clean up temp file
    res.json({ success: true, report });
  } catch (err) {
    fs.unlinkSync(filePath);
    console.error('Parse error:', err);
    res.status(422).json({ error: `Could not parse file: ${err.message}` });
  }
});

// List all reports
app.get('/api/reports', (req, res) => {
  const { type } = req.query;
  res.json(store.getReports(type));
});

// Get a single report
app.get('/api/reports/:id', (req, res) => {
  const report = store.getReport(req.params.id);
  if (!report) return res.status(404).json({ error: 'Not found' });
  res.json(report);
});

// Delete a report
app.delete('/api/reports/:id', (req, res) => {
  const ok = store.deleteReport(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

// Clear all
app.delete('/api/reports', (req, res) => {
  store.clearAll();
  res.json({ success: true });
});

// Stats overview
app.get('/api/stats', (req, res) => {
  const all = store.getReports();
  const dmarc = all.filter(r => r.type === 'dmarc');
  const mtaSts = all.filter(r => r.type === 'mta-sts');

  const dmarcTotals = dmarc.reduce(
    (acc, r) => {
      acc.total += r.summary?.totalMessages || 0;
      acc.pass += r.summary?.passCount || 0;
      acc.fail += r.summary?.failCount || 0;
      return acc;
    },
    { total: 0, pass: 0, fail: 0 }
  );

  const mtaTotals = mtaSts.reduce(
    (acc, r) => {
      acc.success += r.summary?.totalSuccess || 0;
      acc.fail += r.summary?.totalFail || 0;
      return acc;
    },
    { success: 0, fail: 0 }
  );

  res.json({
    dmarcReports: dmarc.length,
    mtaStsReports: mtaSts.length,
    dmarc: dmarcTotals,
    mtaSts: mtaTotals,
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  🛡  DMARC / MTA-STS Analyzer`);
  console.log(`  ➜  http://localhost:${PORT}\n`);
});
