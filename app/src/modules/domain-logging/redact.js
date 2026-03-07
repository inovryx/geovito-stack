'use strict';

const crypto = require('crypto');

const SECRET_KEY_PATTERN = /(token|secret|password|authorization|api[_-]?key|jwt|cookie)/i;
const EMAIL_KEY_PATTERN = /(^|[_-])(email|e-mail)([_-]|$)/i;
const GUEST_EMAIL_KEY_PATTERN = /(guest[_-]?email|reporter[_-]?email)/i;
const IP_KEY_PATTERN = /(^(ip|ips)$|[_-](ip|ips)$|client[_-]?ip|remote[_-]?ip|forwarded[_-]?for|x-forwarded-for)/i;
const BEARER_PATTERN = /(bearer\s+)[a-z0-9._~+/=-]+/gi;
const ASSIGNMENT_SECRET_PATTERN =
  /((?:token|secret|password|api[_-]?key|authorization)\s*[:=]\s*)([^,\s]+)/gi;
const EMAIL_PATTERN = /\b([a-z0-9._%+-]{1,64})@([a-z0-9.-]+\.[a-z]{2,})\b/gi;
const IPV4_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const IPV6_PATTERN = /\b(?:[a-f0-9]{1,4}:){2,7}[a-f0-9]{1,4}\b/gi;

const IP_MODE = String(process.env.LOG_REDACT_IP_MODE || 'drop')
  .trim()
  .toLowerCase();
const USER_REF_SALT = String(process.env.LOG_USER_REF_SALT || process.env.APP_KEYS || 'geovito-log');

const maskEmail = (input) => {
  const value = String(input || '');
  return value.replace(EMAIL_PATTERN, (_full, local, domain) => {
    const head = local.length > 1 ? local.slice(0, 1) : '*';
    return `${head}***@${domain}`;
  });
};

const redactText = (input) => {
  if (typeof input !== 'string') return input;

  let value = input;
  value = value.replace(BEARER_PATTERN, '$1[REDACTED]');
  value = value.replace(ASSIGNMENT_SECRET_PATTERN, '$1[REDACTED]');
  value = value.replace(IPV4_PATTERN, '[REDACTED_IP]');
  value = value.replace(IPV6_PATTERN, '[REDACTED_IP]');
  value = maskEmail(value);
  return value;
};

const pseudonymizeIp = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '[REDACTED_IP]';
  const digest = crypto.createHash('sha256').update(`${USER_REF_SALT}:${raw}`).digest('hex').slice(0, 16);
  return `ip_${digest}`;
};

const redactIpValue = (value) => {
  if (IP_MODE === 'hash') {
    return pseudonymizeIp(value);
  }
  if (IP_MODE === 'drop') {
    return undefined;
  }
  return '[REDACTED_IP]';
};

const redactByKey = (key, value) => {
  const normalizedKey = String(key || '');
  if (SECRET_KEY_PATTERN.test(normalizedKey)) {
    return '[REDACTED]';
  }
  if (GUEST_EMAIL_KEY_PATTERN.test(normalizedKey)) {
    return undefined;
  }
  if (EMAIL_KEY_PATTERN.test(normalizedKey)) {
    return maskEmail(String(value || ''));
  }
  if (IP_KEY_PATTERN.test(normalizedKey)) {
    return redactIpValue(value);
  }
  return value;
};

const redactObject = (input, depth = 0) => {
  if (depth > 6) return '[TRUNCATED]';
  if (input === null || input === undefined) return input;

  if (typeof input === 'string') return redactText(input);
  if (typeof input === 'number' || typeof input === 'boolean') return input;

  if (Array.isArray(input)) {
    return input.map((item) => redactObject(item, depth + 1));
  }

  if (input instanceof Date) {
    return input.toISOString();
  }

  if (input instanceof Error) {
    return {
      name: input.name,
      message: redactText(input.message || ''),
    };
  }

  if (typeof input === 'object') {
    const output = {};
    for (const [key, value] of Object.entries(input)) {
      const redacted = redactObject(redactByKey(key, value), depth + 1);
      if (redacted !== undefined) {
        output[key] = redacted;
      }
    }
    return output;
  }

  return redactText(String(input));
};

module.exports = {
  redactText,
  redactObject,
};
