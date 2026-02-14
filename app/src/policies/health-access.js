'use strict';

const LOCAL_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost']);

const normalize = (value) => String(value || '').trim().toLowerCase();

const isLocalIp = (value) => {
  const ip = normalize(value);
  if (!ip) return false;
  if (LOCAL_IPS.has(ip)) return true;
  if (ip.startsWith('127.')) return true;
  return false;
};

const safeEqual = (left, right) => {
  const a = String(left || '');
  const b = String(right || '');
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
};

module.exports = async (ctx) => {
  const expectedToken = normalize(process.env.HEALTH_TOKEN);
  const providedToken = normalize(ctx.request.get('x-health-token'));
  if (expectedToken && providedToken && safeEqual(expectedToken, providedToken)) {
    return true;
  }

  const socketIp = normalize(ctx.request?.socket?.remoteAddress);
  const requestIp = normalize(ctx.ip || ctx.request?.ip);
  if (isLocalIp(socketIp) || isLocalIp(requestIp)) {
    return true;
  }

  ctx.status = 403;
  ctx.body = {
    ok: false,
    db: false,
    error: 'forbidden',
  };
  return false;
};
