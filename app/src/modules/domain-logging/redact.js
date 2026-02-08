'use strict';

const SECRET_KEY_PATTERN = /(token|secret|password|authorization|api[_-]?key|jwt|cookie)/i;
const BEARER_PATTERN = /(bearer\s+)[a-z0-9._~+/=-]+/gi;
const ASSIGNMENT_SECRET_PATTERN =
  /((?:token|secret|password|api[_-]?key|authorization)\s*[:=]\s*)([^,\s]+)/gi;
const EMAIL_PATTERN = /\b([a-z0-9._%+-]{1,64})@([a-z0-9.-]+\.[a-z]{2,})\b/gi;

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
  value = maskEmail(value);
  return value;
};

const redactByKey = (key, value) => {
  if (SECRET_KEY_PATTERN.test(String(key || ''))) {
    return '[REDACTED]';
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
      output[key] = redactObject(redactByKey(key, value), depth + 1);
    }
    return output;
  }

  return redactText(String(input));
};

module.exports = {
  redactText,
  redactObject,
};
