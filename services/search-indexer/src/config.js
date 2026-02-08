'use strict';

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'production',
  port: Number(process.env.PORT || 4400),
  webhookSecret: process.env.SEARCH_WEBHOOK_SECRET || '',
  reindexToken: process.env.SEARCH_REINDEX_TOKEN || '',
};
