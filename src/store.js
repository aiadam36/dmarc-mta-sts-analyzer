'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '../reports/db.json');

function loadDb() {
  if (!fs.existsSync(DB_PATH)) return { reports: [] };
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return { reports: [] };
  }
}

function saveDb(db) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function addReport(report, filename) {
  const db = loadDb();
  const id = crypto.randomUUID();
  const entry = {
    id,
    filename,
    uploadedAt: new Date().toISOString(),
    ...report,
  };
  db.reports.unshift(entry);
  saveDb(db);
  return entry;
}

function getReports(type) {
  const db = loadDb();
  if (type) return db.reports.filter(r => r.type === type);
  return db.reports;
}

function getReport(id) {
  const db = loadDb();
  return db.reports.find(r => r.id === id) || null;
}

function deleteReport(id) {
  const db = loadDb();
  const before = db.reports.length;
  db.reports = db.reports.filter(r => r.id !== id);
  saveDb(db);
  return db.reports.length < before;
}

function clearAll() {
  saveDb({ reports: [] });
}

module.exports = { addReport, getReports, getReport, deleteReport, clearAll };
