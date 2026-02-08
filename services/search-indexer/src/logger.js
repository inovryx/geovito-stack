'use strict';

const pino = require('pino');

module.exports = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: {
    service: 'search-indexer',
    env: process.env.NODE_ENV || 'production',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
