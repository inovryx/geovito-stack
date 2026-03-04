'use strict';

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const parseEmailCsv = (value) =>
  String(value || '')
    .split(',')
    .map((entry) => normalizeEmail(entry))
    .filter(Boolean);

const resolveOwnerEmailHints = (env = process.env) => {
  const buckets = [
    env?.OWNER_EMAILS,
    env?.PUBLIC_OWNER_EMAILS,
    env?.OWNER_EMAIL,
    env?.PUBLIC_OWNER_EMAIL,
  ];
  const hints = new Set();
  for (const bucket of buckets) {
    for (const email of parseEmailCsv(bucket)) {
      hints.add(email);
    }
  }
  return Array.from(hints);
};

const isOwnerEmail = (email, hints = []) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return false;
  if (!Array.isArray(hints) || hints.length === 0) return false;
  return hints.includes(normalizedEmail);
};

module.exports = {
  normalizeEmail,
  parseEmailCsv,
  resolveOwnerEmailHints,
  isOwnerEmail,
};
