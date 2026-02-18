import { expect, test } from '@playwright/test';
import { resolveStrapiBaseUrl } from '../src/lib/strapiConfig';

test('guard blocks localhost Strapi URL in production-like mode', () => {
  expect(() =>
    resolveStrapiBaseUrl({
      CF_PAGES: '1',
      STRAPI_URL: 'http://127.0.0.1:1337',
    })
  ).toThrow(/STRAPI_URL_GUARD/);
});

test('guard blocks missing Strapi URL in production-like mode', () => {
  expect(() =>
    resolveStrapiBaseUrl({
      NODE_ENV: 'production',
    })
  ).toThrow(/STRAPI_URL_GUARD/);
});

test('guard blocks Strapi URL when it matches public site origin in production-like mode', () => {
  expect(() =>
    resolveStrapiBaseUrl({
      NODE_ENV: 'production',
      STRAPI_URL: 'https://geovito.com',
      PUBLIC_SITE_URL: 'https://geovito.com',
    })
  ).toThrow(/STRAPI_URL_GUARD/);
});

test('guard allows distinct Strapi/CMS origin in production-like mode', () => {
  expect(
    resolveStrapiBaseUrl({
      NODE_ENV: 'production',
      STRAPI_URL: 'https://cms.geovito.com',
      PUBLIC_SITE_URL: 'https://geovito.com',
    })
  ).toBe('https://cms.geovito.com');
});

test('guard allows localhost Strapi URL in development mode', () => {
  expect(
    resolveStrapiBaseUrl({
      NODE_ENV: 'development',
      STRAPI_URL: 'http://127.0.0.1:1337',
    })
  ).toBe('http://127.0.0.1:1337');
});

test('guard allows localhost Strapi URL with explicit override', () => {
  expect(
    resolveStrapiBaseUrl({
      NODE_ENV: 'production',
      STRAPI_URL: 'http://localhost:1337/',
      ALLOW_LOCALHOST_STRAPI: 'true',
    })
  ).toBe('http://localhost:1337');
});
