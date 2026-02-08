module.exports = ({ env }) => ({
  'users-permissions': {
    config: {
      ratelimit: {
        enabled: true,
        interval: env.int('RATE_LIMIT_INTERVAL', 60000),
        max: env.int('RATE_LIMIT_MAX', 100),
      },
    },
  },
});
