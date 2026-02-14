export const prerender = true;

const pickFirst = (...values: Array<string | undefined>) => {
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized.length > 0) {
      return normalized;
    }
  }
  return 'unknown';
};

export const GET = () => {
  const buildShaFull = pickFirst(
    import.meta.env.CF_PAGES_COMMIT_SHA,
    import.meta.env.PUBLIC_BUILD_SHA,
    import.meta.env.GIT_COMMIT_SHA
  );

  const buildBranch = pickFirst(
    import.meta.env.CF_PAGES_BRANCH,
    import.meta.env.PUBLIC_BUILD_BRANCH
  );

  const payload = {
    build_sha7: buildShaFull === 'unknown' ? 'unknown' : buildShaFull.slice(0, 7),
    build_sha_full: buildShaFull,
    build_branch: buildBranch,
    build_time_utc: new Date().toISOString(),
  };

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });
};
