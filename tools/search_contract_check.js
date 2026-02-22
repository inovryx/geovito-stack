#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const atlasPath = process.env.ATLAS_DOCS || path.join(root, 'artifacts/search/atlas-documents.json');
const blogPath = process.env.BLOG_DOCS || path.join(root, 'artifacts/search/blog-documents.json');

const readJson = (filePath) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing file: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
};

const fail = (message) => {
  console.error(`FAIL: ${message}`);
  process.exit(1);
};

const pass = (message) => {
  console.log(`PASS: ${message}`);
};

const checkAtlas = (payload) => {
  const documents = Array.isArray(payload?.documents) ? payload.documents : [];
  const meta = Array.isArray(payload?.document_meta) ? payload.document_meta : [];
  const mockMap = new Map(meta.map((entry) => [entry.document_id, Boolean(entry.mock)]));

  for (const doc of documents) {
    if (doc.language !== 'en') {
      fail(`atlas document language not en: ${doc.document_id}`);
    }
    const isMock = mockMap.get(doc.document_id) || false;
    if (isMock && doc.is_indexable) {
      fail(`atlas mock document marked indexable: ${doc.document_id}`);
    }
    if (doc.is_indexable && doc.language !== 'en') {
      fail(`atlas indexable doc not en: ${doc.document_id}`);
    }
  }

  pass(`atlas documents checked (${documents.length})`);
};

const checkBlog = (payload) => {
  const documents = Array.isArray(payload?.documents) ? payload.documents : [];

  for (const doc of documents) {
    if (doc.language !== 'en') {
      fail(`blog document language not en: ${doc.document_id}`);
    }
    if (doc.mock && doc.is_indexable) {
      fail(`blog mock document marked indexable: ${doc.document_id}`);
    }
    if (doc.is_indexable && doc.language !== 'en') {
      fail(`blog indexable doc not en: ${doc.document_id}`);
    }
  }

  pass(`blog documents checked (${documents.length})`);
};

const main = () => {
  const atlas = readJson(atlasPath);
  const blog = readJson(blogPath);
  checkAtlas(atlas);
  checkBlog(blog);
  console.log('SEARCH CONTRACT CHECK: PASS');
};

main();
