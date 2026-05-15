# DMARC / MTA-STS Analyzer

A local-first web application for analyzing DMARC aggregate reports and MTA-STS TLS reports.

---

## Features

- **DMARC Reports** — parse RFC 7489 aggregate reports (XML, ZIP, GZ)
- **MTA-STS / TLS-RPT** — parse RFC 8460 TLS reports (JSON, GZ, ZIP)
- Drag & drop upload, multi-file batch import
- Per-report breakdown: pass/fail rates, top senders, per-record detail
- Persistent local storage (`reports/db.json`)
- Clean dark industrial UI

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start

# or for development with auto-reload:
npm run dev
```

Then open `http://localhost:3000`

---

## Supported File Formats

| Protocol | Format |
|---|---|
| DMARC | `.xml` · `.xml.gz` · `.zip` (containing XML) |
| MTA-STS | `.json` · `.json.gz` · `.zip` (containing JSON) |

Most mail providers send reports as `.gz` or `.zip` attachments. The analyzer auto-detects the format.

**Tip:** Files with `tlsrpt` or `mta-sts` in the filename are treated as MTA-STS reports; everything else is treated as DMARC.

---

## Data Storage

All parsed reports are stored in `reports/db.json`. Uploaded files are deleted after parsing.
