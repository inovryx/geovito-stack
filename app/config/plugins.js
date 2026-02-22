const parseBool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

module.exports = ({ env }) => {
  const emailProvider = env('EMAIL_PROVIDER', 'sendmail').trim().toLowerCase();

  const emailConfig =
    emailProvider === 'nodemailer'
      ? {
          provider: 'nodemailer',
          providerOptions: {
            host: env('EMAIL_SMTP_HOST', ''),
            port: env.int('EMAIL_SMTP_PORT', 587),
            secure: parseBool(env('EMAIL_SMTP_SECURE', 'false')),
            ignoreTLS: parseBool(env('EMAIL_SMTP_IGNORE_TLS', 'false')),
            requireTLS: parseBool(env('EMAIL_SMTP_REQUIRE_TLS', 'false')),
            auth: {
              user: env('EMAIL_SMTP_USER', ''),
              pass: env('EMAIL_SMTP_PASS', ''),
            },
            pool: parseBool(env('EMAIL_SMTP_POOL', 'true')),
            maxConnections: env.int('EMAIL_SMTP_MAX_CONNECTIONS', 5),
            maxMessages: env.int('EMAIL_SMTP_MAX_MESSAGES', 100),
            tls: {
              rejectUnauthorized: parseBool(env('EMAIL_SMTP_REJECT_UNAUTHORIZED', 'true')),
            },
          },
          settings: {
            defaultFrom: env('EMAIL_DEFAULT_FROM', 'noreply@geovito.local'),
            defaultReplyTo: env('EMAIL_DEFAULT_REPLY_TO', env('EMAIL_DEFAULT_FROM', 'noreply@geovito.local')),
          },
        }
      : {
          provider: 'sendmail',
          providerOptions: {},
          settings: {
            defaultFrom: env('EMAIL_DEFAULT_FROM', 'noreply@geovito.local'),
            defaultReplyTo: env('EMAIL_DEFAULT_REPLY_TO', env('EMAIL_DEFAULT_FROM', 'noreply@geovito.local')),
          },
        };

  return {
    'users-permissions': {
      config: {
        ratelimit: {
          enabled: true,
          interval: env.int('RATE_LIMIT_INTERVAL', 60000),
          max: env.int('RATE_LIMIT_MAX', 100),
        },
      },
    },
    email: {
      config: emailConfig,
    },
    upload: {
      config: {
        sizeLimit: env.int('UPLOAD_MAX_FILE_SIZE_BYTES', 8 * 1024 * 1024),
        breakpoints: {
          large: env.int('UPLOAD_BREAKPOINT_LARGE', 1280),
          medium: env.int('UPLOAD_BREAKPOINT_MEDIUM', 768),
          small: env.int('UPLOAD_BREAKPOINT_SMALL', 480),
        },
      },
    },
  };
};
