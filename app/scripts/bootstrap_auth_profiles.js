'use strict';

const path = require('path');
const { createStrapi } = require('@strapi/core');

const APP_DIR = path.resolve(__dirname, '..');

const DEFAULTS = {
  superPrimaryEmail: 'geovitoworld@gmail.com',
  superPrimaryPassword: 'koc00785',
  superSecondaryEmail: 'ali.koc.00@gmail.com',
  superSecondaryPassword: '123456',
  altAdminEmail: 'admin.operator@geovito.com',
  altAdminPassword: '123456',
  altAdminFirstname: 'Alt',
  altAdminLastname: 'Admin',
  altAdminRoleName: 'GeoVito Alt Admin',
  altAdminRoleCode: 'geovito-alt-admin',
  altAdminRoleDescription: 'Limited admin role for UGC moderation and media management.',
  memberEmail: 'member.user@geovito.com',
  memberUsername: 'geovito_member',
  memberPassword: '123456',
};

const readEnv = (key, fallback) => {
  const value = String(process.env[key] || '').trim();
  return value || fallback;
};

const cfg = {
  superPrimaryEmail: readEnv('SUPER_ADMIN_PRIMARY_EMAIL', DEFAULTS.superPrimaryEmail),
  superPrimaryPassword: readEnv('SUPER_ADMIN_PRIMARY_PASSWORD', DEFAULTS.superPrimaryPassword),
  superSecondaryEmail: readEnv('SUPER_ADMIN_SECONDARY_EMAIL', DEFAULTS.superSecondaryEmail),
  superSecondaryPassword: readEnv('SUPER_ADMIN_SECONDARY_PASSWORD', DEFAULTS.superSecondaryPassword),
  altAdminEmail: readEnv('ALT_ADMIN_EMAIL', DEFAULTS.altAdminEmail),
  altAdminPassword: readEnv('ALT_ADMIN_PASSWORD', DEFAULTS.altAdminPassword),
  altAdminFirstname: readEnv('ALT_ADMIN_FIRSTNAME', DEFAULTS.altAdminFirstname),
  altAdminLastname: readEnv('ALT_ADMIN_LASTNAME', DEFAULTS.altAdminLastname),
  altAdminRoleName: readEnv('ALT_ADMIN_ROLE_NAME', DEFAULTS.altAdminRoleName),
  altAdminRoleCode: readEnv('ALT_ADMIN_ROLE_CODE', DEFAULTS.altAdminRoleCode),
  altAdminRoleDescription: readEnv('ALT_ADMIN_ROLE_DESCRIPTION', DEFAULTS.altAdminRoleDescription),
  memberEmail: readEnv('MEMBER_USER_EMAIL', DEFAULTS.memberEmail),
  memberUsername: readEnv('MEMBER_USER_USERNAME', DEFAULTS.memberUsername),
  memberPassword: readEnv('MEMBER_USER_PASSWORD', DEFAULTS.memberPassword),
};

const CONTENT_SUBJECTS = [
  'api::blog-post.blog-post',
  'api::blog-comment.blog-comment',
  'api::content-report.content-report',
  'api::account-request.account-request',
  'api::creator-profile.creator-profile',
  'api::blog-post-revision.blog-post-revision',
];

const ALLOWED_CONTENT_ACTIONS = new Set([
  'plugin::content-manager.explorer.read',
  'plugin::content-manager.explorer.update',
  'plugin::content-manager.explorer.publish',
]);

const ALLOWED_UPLOAD_ACTIONS = new Set([
  'plugin::upload.read',
  'plugin::upload.configure-view',
  'plugin::upload.assets.create',
  'plugin::upload.assets.update',
  'plugin::upload.assets.download',
  'plugin::upload.assets.copy-link',
]);

const compactPermission = (permission) => ({
  action: permission.action,
  subject: permission.subject || null,
  properties: permission.properties || {},
  conditions: permission.conditions || [],
});

const createStrapiApp = async () => {
  const app = createStrapi({
    appDir: APP_DIR,
    distDir: APP_DIR,
    autoReload: false,
    serveAdminPanel: false,
  });
  await app.load();
  return app;
};

const run = async () => {
  let strapi;
  try {
    strapi = await createStrapiApp();

    const superRole = await strapi.db.query('admin::role').findOne({
      where: { code: 'strapi-super-admin' },
    });
    if (!superRole) {
      throw new Error('admin role not found: strapi-super-admin');
    }

    let altRole = await strapi.db.query('admin::role').findOne({
      where: { code: cfg.altAdminRoleCode },
    });

    if (!altRole) {
      altRole = await strapi.admin.services.role.create({
        name: cfg.altAdminRoleName,
        code: cfg.altAdminRoleCode,
        description: cfg.altAdminRoleDescription,
      });
    } else {
      await strapi.admin.services.role.update(
        { id: altRole.id },
        {
          name: cfg.altAdminRoleName,
          description: cfg.altAdminRoleDescription,
        }
      );
      altRole = await strapi.db.query('admin::role').findOne({
        where: { id: altRole.id },
      });
    }

    const superPermissions = await strapi.db.query('admin::permission').findMany({
      where: { role: superRole.id },
      select: ['action', 'subject', 'properties', 'conditions'],
    });

    const filtered = [];
    for (const permission of superPermissions) {
      if (ALLOWED_UPLOAD_ACTIONS.has(permission.action)) {
        filtered.push(compactPermission(permission));
        continue;
      }
      if (
        ALLOWED_CONTENT_ACTIONS.has(permission.action) &&
        permission.subject &&
        CONTENT_SUBJECTS.includes(permission.subject)
      ) {
        filtered.push(compactPermission(permission));
      }
    }

    const deduped = new Map();
    for (const permission of filtered) {
      const key = `${permission.action}::${permission.subject || ''}`;
      if (!deduped.has(key)) {
        deduped.set(key, permission);
      }
    }
    const finalPermissions = Array.from(deduped.values());
    await strapi.admin.services.role.assignPermissions(altRole.id, finalPermissions);

    const ensureAdmin = async ({ email, password, firstname, lastname, roleId }) => {
      let user = await strapi.db.query('admin::user').findOne({
        where: { email },
        populate: ['roles'],
      });

      if (!user) {
        user = await strapi.admin.services.user.create({
          email,
          firstname,
          lastname,
          password,
          isActive: true,
          blocked: false,
          roles: [roleId],
        });
      } else {
        await strapi.admin.services.user.updateById(user.id, {
          firstname: firstname || user.firstname || null,
          lastname: lastname || user.lastname || null,
          password,
          isActive: true,
          blocked: false,
          roles: [roleId],
        });
      }

      const finalUser = await strapi.db.query('admin::user').findOne({
        where: { email },
        populate: ['roles'],
      });
      return {
        id: finalUser.id,
        email: finalUser.email,
        isActive: Boolean(finalUser.isActive),
        blocked: Boolean(finalUser.blocked),
        roles: (finalUser.roles || []).map((role) => role.code),
      };
    };

    const ensureMemberUser = async ({ email, username, password }) => {
      const authRole = await strapi.db.query('plugin::users-permissions.role').findOne({
        where: { type: 'authenticated' },
      });
      if (!authRole) {
        throw new Error('users-permissions authenticated role not found');
      }

      let user = await strapi.db.query('plugin::users-permissions.user').findOne({
        where: { email },
      });
      if (!user) {
        user = await strapi.plugin('users-permissions').service('user').add({
          username,
          email,
          provider: 'local',
          password,
          confirmed: true,
          blocked: false,
          role: authRole.id,
        });
      } else {
        user = await strapi.plugin('users-permissions').service('user').edit(user.id, {
          username,
          provider: 'local',
          password,
          confirmed: true,
          blocked: false,
          role: authRole.id,
        });
      }

      const finalUser = await strapi.db.query('plugin::users-permissions.user').findOne({
        where: { id: user.id },
      });

      return {
        id: finalUser.id,
        email: finalUser.email,
        username: finalUser.username,
        provider: finalUser.provider,
        confirmed: Boolean(finalUser.confirmed),
        blocked: Boolean(finalUser.blocked),
      };
    };

    const superPrimary = await ensureAdmin({
      email: cfg.superPrimaryEmail,
      password: cfg.superPrimaryPassword,
      firstname: 'geovito',
      lastname: 'world',
      roleId: superRole.id,
    });

    const superSecondary = await ensureAdmin({
      email: cfg.superSecondaryEmail,
      password: cfg.superSecondaryPassword,
      firstname: 'Ali',
      lastname: 'Koc',
      roleId: superRole.id,
    });

    const altAdmin = await ensureAdmin({
      email: cfg.altAdminEmail,
      password: cfg.altAdminPassword,
      firstname: cfg.altAdminFirstname,
      lastname: cfg.altAdminLastname,
      roleId: altRole.id,
    });

    const memberUser = await ensureMemberUser({
      email: cfg.memberEmail,
      username: cfg.memberUsername,
      password: cfg.memberPassword,
    });

    const altRolePermissionCount = await strapi.db.query('admin::permission').count({
      where: { role: altRole.id },
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          profiles: {
            superPrimary,
            superSecondary,
            altAdmin,
            memberUser,
          },
          altAdminRole: {
            id: altRole.id,
            code: altRole.code,
            name: altRole.name,
            permissions: altRolePermissionCount,
          },
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (strapi) {
      await strapi.destroy();
    }
  }
};

void run();
