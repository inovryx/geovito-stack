import { expect, test } from '@playwright/test';
import { GET } from '../src/pages/@[username]';

const redirectResponse = (location: string, status = 302) =>
  new Response(null, {
    status,
    headers: {
      location,
    },
  });

const callAliasRoute = (username: string, headers: Record<string, string> = {}) =>
  GET({
    params: {
      username,
    },
    request: new Request(`https://geovito.com/@${username}`, {
      headers,
    }),
    redirect: redirectResponse,
  } as Parameters<typeof GET>[0]);

test('alias route uses ui language cookie first and redirects with 307', () => {
  const response = callAliasRoute('OlmySweet', {
    cookie: 'foo=bar; geovito_ui_lang=tr',
    'accept-language': 'de-DE,de;q=0.9,en;q=0.8',
  });

  expect(response.status).toBe(307);
  expect(response.headers.get('location')).toBe('/tr/@olmysweet/');
});

test('alias route falls back to accept-language when cookie is missing', () => {
  const response = callAliasRoute('ali-user', {
    'accept-language': 'fr-CA,fr;q=0.9,en;q=0.8',
  });

  expect(response.status).toBe(307);
  expect(response.headers.get('location')).toBe('/fr/@ali-user/');
});

test('alias route normalizes zh variants to zh-cn', () => {
  const response = callAliasRoute('geo', {
    'accept-language': 'zh-TW,zh;q=0.9,en;q=0.8',
  });

  expect(response.status).toBe(307);
  expect(response.headers.get('location')).toBe('/zh-cn/@geo/');
});

test('alias route defaults to en without cookie or accept-language', () => {
  const response = callAliasRoute('someone');

  expect(response.status).toBe(307);
  expect(response.headers.get('location')).toBe('/en/@someone/');
});

test('alias route returns 404 when username becomes empty after normalization', () => {
  const response = callAliasRoute('!!!');

  expect(response.status).toBe(404);
});
