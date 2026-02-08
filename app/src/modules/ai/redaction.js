'use strict';

const SECRET_PATTERNS = [
  /(bearer\s+)[a-z0-9._~+/=-]+/gi,
  /((?:api[_-]?key|token|secret|password|authorization)\s*[:=]\s*)([^\s,]+)/gi,
  /(STRAPI_API_TOKEN\s*[:=]\s*)([^\s,]+)/gi,
];

const EMAIL_PATTERN = /\b([a-z0-9._%+-]{1,64})@([a-z0-9.-]+\.[a-z]{2,})\b/gi;
const SECRET_KEYS = /(token|secret|password|authorization|api[_-]?key|cookie|jwt)/i;

const redactText = (input) => {
  if (typeof input !== 'string') return input;
  let value = String(input);

  for (const pattern of SECRET_PATTERNS) {
    value = value.replace(pattern, '$1[REDACTED]');
  }

  value = value.replace(EMAIL_PATTERN, (_full, local, domain) => {
    const head = local.length > 1 ? local.slice(0, 1) : '*';
    return `${head}***@${domain}`;
  });

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
      output[key] = SECRET_KEYS.test(key) ? '[REDACTED]' : redactObject(value, depth + 1);
    }
    return output;
  }

  return redactText(String(input));
};

module.exports = {
  redactText,
  redactObject,
};
