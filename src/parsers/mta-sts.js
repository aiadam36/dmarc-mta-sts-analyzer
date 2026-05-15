'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { extractFirst } = require('../zip');

/**
 * MTA-STS TLS reports follow RFC 8460 (JSON format).
 * They can be delivered as plain JSON, gzipped JSON, or ZIP.
 */

function parseMtaStsJson(jsonString) {
  const raw = JSON.parse(jsonString);

  const policies = (raw.policies || []).map(p => {
    const policyInfo = p.policy || {};
    const failureDetails = p['failure-details'] || [];
    const summary = p.summary || {};

    return {
      policyDomain: policyInfo['policy-domain'] || '',
      policyType: policyInfo['policy-type'] || '',
      policyStrings: policyInfo['policy-string'] || [],
      mxHost: policyInfo['mx-host'] || [],
      totalSuccessfulSessionCount: summary['total-successful-session-count'] || 0,
      totalFailureSessionCount: summary['total-failure-session-count'] || 0,
      failureDetails: failureDetails.map(fd => ({
        resultType: fd['result-type'] || '',
        sendingMtaIp: fd['sending-mta-ip'] || '',
        receivingMxHostname: fd['receiving-mx-hostname'] || '',
        receivingMxHelo: fd['receiving-mx-helo'] || '',
        receivingIp: fd['receiving-ip'] || '',
        failedSessionCount: fd['failed-session-count'] || 0,
        additionalInfo: fd['additional-info'] || '',
        failureReasonCode: fd['failure-reason-code'] || '',
      })),
    };
  });

  const totalSuccess = policies.reduce((s, p) => s + p.totalSuccessfulSessionCount, 0);
  const totalFail = policies.reduce((s, p) => s + p.totalFailureSessionCount, 0);

  // Aggregate failure types
  const failureTypes = {};
  for (const pol of policies) {
    for (const fd of pol.failureDetails) {
      const rt = fd.resultType || 'unknown';
      failureTypes[rt] = (failureTypes[rt] || 0) + fd.failedSessionCount;
    }
  }

  return {
    type: 'mta-sts',
    organizationName: raw['organization-name'] || '',
    dateRange: {
      startDatetime: raw['date-range']?.['start-datetime'] || '',
      endDatetime: raw['date-range']?.['end-datetime'] || '',
    },
    contactInfo: raw['contact-info'] || '',
    reportId: raw['report-id'] || '',
    policies,
    summary: {
      totalSuccess,
      totalFail,
      totalSessions: totalSuccess + totalFail,
      successRate: totalSuccess + totalFail > 0
        ? ((totalSuccess / (totalSuccess + totalFail)) * 100).toFixed(1)
        : '0.0',
      failureTypes: Object.entries(failureTypes)
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => ({ type, count })),
    },
  };
}

async function parseMtaStsFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  let jsonString;

  if (ext === '.json') {
    jsonString = fs.readFileSync(filePath, 'utf8');
  } else if (ext === '.gz' || ext === '.gzip') {
    const compressed = fs.readFileSync(filePath);
    jsonString = zlib.gunzipSync(compressed).toString('utf8');
  } else if (ext === '.zip') {
    const zipBuf = fs.readFileSync(filePath);
    const content = extractFirst(zipBuf, name => name.endsWith('.json'));
    if (!content) throw new Error('No JSON found inside ZIP');
    jsonString = content.toString('utf8');
  } else {
    // Try to detect format
    try {
      const compressed = fs.readFileSync(filePath);
      jsonString = zlib.gunzipSync(compressed).toString('utf8');
    } catch {
      jsonString = fs.readFileSync(filePath, 'utf8');
    }
  }

  return parseMtaStsJson(jsonString);
}

module.exports = { parseMtaStsFile, parseMtaStsJson };
