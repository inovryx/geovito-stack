'use strict';

const express = require('express');
const crypto = require('crypto');
const config = require('./config');
const logger = require('./logger');

const app = express();
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  const incoming = req.get('x-request-id');
  const requestId = incoming && incoming.trim() ? incoming.trim() : crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  const startedAt = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level]({
      request_id: requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: durationMs,
      ip: req.ip,
      event: 'http_request',
    });
  });

  next();
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'search-indexer' });
});

app.post('/webhook', (req, res) => {
  if (config.webhookSecret) {
    const provided = req.get('x-webhook-secret') || '';
    if (provided !== config.webhookSecret) {
      logger.warn({ request_id: req.requestId, event: 'webhook_rejected' }, 'invalid webhook secret');
      return res.status(401).json({ error: 'unauthorized' });
    }
  }

  logger.info({
    request_id: req.requestId,
    event: 'webhook_received',
    payload_type: req.body?.type || null,
    payload_event: req.body?.event || null,
  });

  return res.status(202).json({ accepted: true });
});

app.post('/reindex', (req, res) => {
  if (config.reindexToken) {
    const provided = req.get('x-reindex-token') || '';
    if (provided !== config.reindexToken) {
      logger.warn({ request_id: req.requestId, event: 'reindex_rejected' }, 'invalid reindex token');
      return res.status(401).json({ error: 'unauthorized' });
    }
  }

  logger.info({ request_id: req.requestId, event: 'reindex_requested', body: req.body || {} });
  return res.status(202).json({ accepted: true, status: 'queued' });
});

app.use((err, req, res, next) => {
  logger.error({ request_id: req.requestId, event: 'unhandled_error', error: err.message });
  res.status(500).json({ error: 'internal_error' });
});

app.listen(config.port, () => {
  logger.info({ event: 'service_started', port: config.port }, 'search-indexer started');
});
