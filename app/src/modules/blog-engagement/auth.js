'use strict';

const readBearerToken = (ctx) => {
  const raw =
    ctx.request.get('authorization') || ctx.request.get('Authorization') || '';
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match && match[1] ? match[1].trim() : '';
};

const toPositiveInt = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const authenticateFromBearer = async (strapi, ctx) => {
  const token = readBearerToken(ctx);
  if (!token) return null;

  try {
    const jwtService = strapi.plugin('users-permissions').service('jwt');
    const userService = strapi.plugin('users-permissions').service('user');

    const payload = await jwtService.verify(token);
    const userId = toPositiveInt(payload?.id);
    if (!userId) return null;

    const user = await userService.fetchAuthenticatedUser(userId);
    if (!user || user.blocked === true) return null;

    return {
      id: user.id,
      username: user.username || '',
      email: user.email || '',
      confirmed: user.confirmed !== false,
      blocked: user.blocked === true,
    };
  } catch (_error) {
    return null;
  }
};

module.exports = {
  readBearerToken,
  authenticateFromBearer,
};
