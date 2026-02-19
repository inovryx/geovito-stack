'use strict';

const { BLOG_COMMENT_STATUS } = require('../src/modules/blog-engagement/constants');
const {
  assertAllowedTransition,
  requireModerationNotes,
  isModeratedStatus,
} = require('../src/modules/blog-engagement/comment-state-machine');

let failCount = 0;

const pass = (message) => {
  console.log(`PASS: ${message}`);
};

const fail = (message) => {
  console.error(`FAIL: ${message}`);
  failCount += 1;
};

const expectPass = (label, fn) => {
  try {
    fn();
    pass(label);
  } catch (error) {
    fail(`${label} -> unexpected error: ${error.message}`);
  }
};

const expectFail = (label, fn) => {
  try {
    fn();
    fail(`${label} -> expected validation error but succeeded`);
  } catch {
    pass(label);
  }
};

const runTransitionChecks = () => {
  const S = BLOG_COMMENT_STATUS;

  const allowedTransitions = [
    [S.PENDING, S.APPROVED],
    [S.PENDING, S.REJECTED],
    [S.PENDING, S.SPAM],
    [S.PENDING, S.DELETED],
    [S.APPROVED, S.REJECTED],
    [S.APPROVED, S.SPAM],
    [S.APPROVED, S.DELETED],
    [S.REJECTED, S.APPROVED],
    [S.REJECTED, S.DELETED],
    [S.SPAM, S.REJECTED],
    [S.SPAM, S.DELETED],
    [S.DELETED, S.DELETED],
  ];

  const blockedTransitions = [
    [S.APPROVED, S.PENDING],
    [S.SPAM, S.APPROVED],
    [S.DELETED, S.APPROVED],
    [S.DELETED, S.PENDING],
  ];

  for (const [from, to] of allowedTransitions) {
    expectPass(`allowed transition ${from} -> ${to}`, () => {
      assertAllowedTransition(from, to);
    });
  }

  for (const [from, to] of blockedTransitions) {
    expectFail(`blocked transition ${from} -> ${to}`, () => {
      assertAllowedTransition(from, to);
    });
  }
};

const runNotesChecks = () => {
  const S = BLOG_COMMENT_STATUS;

  expectPass('approved does not require moderation_notes', () => {
    requireModerationNotes('', S.APPROVED);
  });

  expectFail('rejected requires moderation_notes', () => {
    requireModerationNotes('', S.REJECTED);
  });

  expectFail('spam requires moderation_notes', () => {
    requireModerationNotes('', S.SPAM);
  });

  expectFail('deleted requires moderation_notes', () => {
    requireModerationNotes('', S.DELETED);
  });

  expectPass('deleted accepts moderation_notes', () => {
    requireModerationNotes('Policy violation', S.DELETED);
  });
};

const runModeratedStatusChecks = () => {
  const S = BLOG_COMMENT_STATUS;
  const matrix = [
    [S.PENDING, false],
    [S.APPROVED, true],
    [S.REJECTED, true],
    [S.SPAM, true],
    [S.DELETED, true],
  ];

  for (const [status, expected] of matrix) {
    const actual = isModeratedStatus(status);
    if (actual === expected) {
      pass(`isModeratedStatus(${status}) = ${expected}`);
    } else {
      fail(`isModeratedStatus(${status}) expected ${expected} got ${actual}`);
    }
  }
};

const main = () => {
  console.log('==============================================================');
  console.log('GEOVITO BLOG COMMENT STATE CONTRACT CHECK');
  console.log('==============================================================');

  runTransitionChecks();
  runNotesChecks();
  runModeratedStatusChecks();

  console.log('==============================================================');
  if (failCount > 0) {
    console.error(`BLOG COMMENT STATE CONTRACT CHECK: FAIL (${failCount} issue)`);
    console.log('==============================================================');
    process.exit(1);
  }
  console.log('BLOG COMMENT STATE CONTRACT CHECK: PASS');
  console.log('==============================================================');
};

main();
