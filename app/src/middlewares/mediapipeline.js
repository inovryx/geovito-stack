'use strict';

const fs = require('fs/promises');
const path = require('path');

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);
const CONVERTIBLE_MIME_TYPES = new Set(['image/jpeg', 'image/png']);
const DEFAULT_ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const EXTENSION_TO_MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};
const MIME_ALIASES = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/x-png': 'image/png',
};
const TARGET_FORMATS = new Set(['webp']);
const ALLOWED_IMAGE_EXTENSIONS_DISPLAY = 'jpg, jpeg, png, webp';

const parseBool = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return fallback;
};

const parseIntEnv = (value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
};

const normalizeTargetFormat = (value) => {
  const normalized = String(value || 'webp').trim().toLowerCase();
  return TARGET_FORMATS.has(normalized) ? normalized : 'webp';
};

const normalizeMimeType = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  return MIME_ALIASES[normalized] || normalized;
};

const isImageMimeType = (mimeType) => String(mimeType || '').startsWith('image/');

const resolveMimeFromToken = (token) => {
  const normalized = String(token || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized.startsWith('image/')) {
    return normalizeMimeType(normalized);
  }
  const extensionToken = normalized.startsWith('.') ? normalized : `.${normalized}`;
  return EXTENSION_TO_MIME[extensionToken] || '';
};

const parseAllowedImageMimeTypes = (value) => {
  if (!value) {
    return new Set(DEFAULT_ALLOWED_IMAGE_MIME_TYPES);
  }

  const tokens = String(value)
    .split(',')
    .map((entry) => resolveMimeFromToken(entry))
    .filter(Boolean);

  if (tokens.length === 0) {
    return new Set(DEFAULT_ALLOWED_IMAGE_MIME_TYPES);
  }

  return new Set(tokens);
};

const detectFileExtension = (file) => {
  const candidate =
    file.originalFilename || file.newFilename || file.name || file.filename || '';
  const extension = path.extname(String(candidate || '')).toLowerCase();
  return extension || '';
};

const resolveFileMimeType = (file) => {
  const rawMime = normalizeMimeType(file.mimetype || file.type);
  if (rawMime && rawMime !== 'application/octet-stream') {
    return rawMime;
  }

  const extension = detectFileExtension(file);
  const extensionMime = EXTENSION_TO_MIME[extension];
  if (extensionMime) {
    return extensionMime;
  }

  return rawMime;
};

const replaceExtension = (filename, extension) => {
  if (typeof filename !== 'string' || filename.length === 0) return filename;
  const parsed = path.parse(filename);
  return `${parsed.name}${extension}`;
};

const collectFileEntries = (node, bucket = []) => {
  if (!node) return bucket;
  if (Array.isArray(node)) {
    for (const entry of node) collectFileEntries(entry, bucket);
    return bucket;
  }
  if (typeof node !== 'object') return bucket;

  if (typeof node.filepath === 'string' && node.filepath.length > 0) {
    bucket.push(node);
    return bucket;
  }

  for (const value of Object.values(node)) {
    collectFileEntries(value, bucket);
  }
  return bucket;
};

module.exports = () => {
  const conversionEnabled = parseBool(process.env.MEDIA_IMAGE_CONVERT_ENABLED, true);
  const requestedTargetFormat = String(process.env.MEDIA_IMAGE_TARGET_FORMAT || 'webp').trim().toLowerCase();
  const targetFormat = normalizeTargetFormat(requestedTargetFormat);
  const targetMimeType = `image/${targetFormat}`;
  const targetExtension = `.${targetFormat}`;
  const quality = parseIntEnv(process.env.MEDIA_IMAGE_QUALITY, 82, { min: 35, max: 95 });
  const maxInputBytes = parseIntEnv(process.env.MEDIA_IMAGE_MAX_INPUT_BYTES, 20 * 1024 * 1024, {
    min: 1024 * 1024,
    max: 100 * 1024 * 1024,
  });
  const strictMode = parseBool(process.env.MEDIA_IMAGE_CONVERT_STRICT, false);
  const allowedImageMimeTypes = parseAllowedImageMimeTypes(process.env.MEDIA_IMAGE_ALLOWED_INPUT_MIME);

  if (conversionEnabled && requestedTargetFormat && requestedTargetFormat !== targetFormat) {
    const message = `[media-pipeline] MEDIA_IMAGE_TARGET_FORMAT=${requestedTargetFormat} is not allowed in current policy, forced to ${targetFormat}`;
    if (typeof strapi !== 'undefined' && strapi?.log?.warn) {
      strapi.log.warn(message);
    } else {
      console.warn(message);
    }
  }

  let sharp = null;
  if (conversionEnabled) {
    try {
      // eslint-disable-next-line global-require
      sharp = require('sharp');
    } catch (error) {
      throw new Error(
        `[media-pipeline] sharp dependency is required when MEDIA_IMAGE_CONVERT_ENABLED=true (${error.message})`
      );
    }
  }

  const convertImage = async (file, ctx) => {
    const mimeType = resolveFileMimeType(file);

    if (!isImageMimeType(mimeType)) return;

    if (!allowedImageMimeTypes.has(mimeType)) {
      ctx.throw(
        415,
        `Unsupported image format (${mimeType}). Allowed formats: ${ALLOWED_IMAGE_EXTENSIONS_DISPLAY}.`
      );
      return;
    }

    file.mimetype = mimeType;
    file.type = mimeType;

    if (!CONVERTIBLE_MIME_TYPES.has(mimeType)) return;

    const sourcePath = file.filepath;
    if (typeof sourcePath !== 'string' || sourcePath.length === 0) return;
    if (Number(file.size || 0) > maxInputBytes) {
      const message = `Image exceeds MEDIA_IMAGE_MAX_INPUT_BYTES (${maxInputBytes})`;
      if (strictMode) {
        throw new Error(message);
      }
      strapi.log.warn(`[media-pipeline] skip conversion: ${message}`);
      return;
    }

    const convertedPath = `${sourcePath}${targetExtension}`;

    await sharp(sourcePath, { failOn: 'none' })
      .rotate()
      .webp({ quality })
      .toFile(convertedPath);

    const stat = await fs.stat(convertedPath);
    file.filepath = convertedPath;
    file.size = stat.size;
    file.mimetype = targetMimeType;
    file.type = targetMimeType;
    file.ext = targetExtension;
    file.originalFilename = replaceExtension(file.originalFilename, targetExtension);
    file.newFilename = replaceExtension(file.newFilename, targetExtension);
    if (typeof file.name === 'string' && file.name) {
      file.name = replaceExtension(file.name, targetExtension);
    }

    await fs.unlink(sourcePath).catch(() => {});
    strapi.log.debug(
      `[media-pipeline] converted upload to ${targetFormat}: ${ctx.request.path} (${file.originalFilename || 'file'})`
    );
  };

  return async (ctx, next) => {
    const method = String(ctx.method || '').toUpperCase();
    const requestPath = String(ctx.request.path || '');
    const isUploadRoute =
      requestPath === '/api/upload' ||
      requestPath.startsWith('/api/upload/') ||
      requestPath === '/upload' ||
      requestPath.startsWith('/upload/');

    if (!conversionEnabled || !isUploadRoute || (method !== 'POST' && method !== 'PUT')) {
      await next();
      return;
    }

    const files = collectFileEntries(ctx.request.files);
    if (files.length === 0) {
      await next();
      return;
    }

    for (const file of files) {
      await convertImage(file, ctx);
    }

    await next();
  };
};
