'use strict';

const xml2js = require('xml2js');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const { extractFirst } = require('../zip');

const parser = new xml2js.Parser({ explicitArray: true, mergeAttrs: false });

function parseXml(xmlString) {
  return new Promise((resolve, reject) => {
    parser.parseString(xmlString, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

function val(v) {
  if (Array.isArray(v)) return v[0];
  return v;
}

function parseRecord(rec) {
  const row = rec.row ? rec.row[0] : {};
  const policyEval = rec.policy_evaluated ? rec.policy_evaluated[0] : {};
  const identifiers = rec.identifiers ? rec.identifiers[0] : {};
  const authResults = rec.auth_results ? rec.auth_results[0] : {};

  const spfResults = [];
  if (authResults.spf) {
    for (const s of authResults.spf) {
      spfResults.push({ domain: val(s.domain), result: val(s.result) });
    }
  }
  const dkimResults = [];
  if (authResults.dkim) {
    for (const d of authResults.dkim) {
      dkimResults.push({
        domain: val(d.domain),
        selector: val(d.selector),
        result: val(d.result),
      });
    }
  }

  return {
    sourceIp: val(row.source_ip) || '',
    count: parseInt(val(row.count) || '1', 10),
    disposition: val(policyEval.disposition) || '',
    dkim: val(policyEval.dkim) || '',
    spf: val(policyEval.spf) || '',
    headerFrom: val(identifiers.header_from) || '',
    envelopeTo: val(identifiers.envelope_to) || '',
    spfResults,
    dkimResults,
  };
}

async function parseDmarcXml(xmlString) {
  const raw = await parseXml(xmlString);
  const fb = raw.feedback;

  const meta = fb.report_metadata ? fb.report_metadata[0] : {};
  const policy = fb.policy_published ? fb.policy_published[0] : {};
  const records = (fb.record || []).map(parseRecord);

  const dateRange = meta.date_range ? meta.date_range[0] : {};

  return {
    type: 'dmarc',
    reportId: val(meta.report_id) || '',
    orgName: val(meta.org_name) || '',
    email: val(meta.email) || '',
    dateBegin: dateRange.begin ? new Date(parseInt(val(dateRange.begin), 10) * 1000).toISOString() : '',
    dateEnd: dateRange.end ? new Date(parseInt(val(dateRange.end), 10) * 1000).toISOString() : '',
    domain: val(policy.domain) || '',
    adkim: val(policy.adkim) || 'r',
    aspf: val(policy.aspf) || 'r',
    pct: parseInt(val(policy.pct) || '100', 10),
    policy: val(policy.p) || '',
    subdomainPolicy: val(policy.sp) || '',
    records,
    summary: buildSummary(records),
  };
}

function buildSummary(records) {
  let totalMessages = 0;
  let passCount = 0;
  let failCount = 0;
  let quarantineCount = 0;
  let rejectCount = 0;
  const ipMap = {};

  for (const r of records) {
    totalMessages += r.count;
    if (r.dkim === 'pass' || r.spf === 'pass') {
      passCount += r.count;
    } else {
      failCount += r.count;
    }
    if (r.disposition === 'quarantine') quarantineCount += r.count;
    if (r.disposition === 'reject') rejectCount += r.count;

    if (!ipMap[r.sourceIp]) ipMap[r.sourceIp] = { pass: 0, fail: 0, count: 0 };
    ipMap[r.sourceIp].count += r.count;
    if (r.dkim === 'pass' || r.spf === 'pass') {
      ipMap[r.sourceIp].pass += r.count;
    } else {
      ipMap[r.sourceIp].fail += r.count;
    }
  }

  const topSenders = Object.entries(ipMap)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([ip, d]) => ({ ip, ...d }));

  return { totalMessages, passCount, failCount, quarantineCount, rejectCount, topSenders };
}

async function parseDmarcFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  let xmlString;

  if (ext === '.xml') {
    xmlString = fs.readFileSync(filePath, 'utf8');
  } else if (ext === '.gz' || ext === '.gzip') {
    const compressed = fs.readFileSync(filePath);
    xmlString = zlib.gunzipSync(compressed).toString('utf8');
  } else if (ext === '.zip') {
    const zipBuf = fs.readFileSync(filePath);
    const content = extractFirst(zipBuf, name => name.endsWith('.xml'));
    if (!content) throw new Error('No XML found inside ZIP');
    xmlString = content.toString('utf8');
  } else {
    // Try gunzip anyway (some files have no extension)
    try {
      const compressed = fs.readFileSync(filePath);
      xmlString = zlib.gunzipSync(compressed).toString('utf8');
    } catch {
      xmlString = fs.readFileSync(filePath, 'utf8');
    }
  }

  return parseDmarcXml(xmlString);
}

module.exports = { parseDmarcFile, parseDmarcXml };
