import assert from 'node:assert/strict';
import {
  extractLorePrIdFromUrl,
  selectNarrativeFile,
  extractAddedMarkdownFromPatch,
  extractAddedMarkdownFromUnifiedDiff,
  extractNarrativeTitle,
  hashNarrative,
  resolveGitHubPrNarrative
} from '../server/githubPrNarrative.js';

function mockResponse(body, { status = 200, contentType, headers = {} } = {}) {
  const textBody = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        const key = String(name).toLowerCase();
        if (key === 'content-type') {
          return contentType || (typeof body === 'string' ? 'text/plain' : 'application/json');
        }
        const match = Object.entries(headers).find(([header]) => header.toLowerCase() === key);
        return match ? String(match[1]) : null;
      }
    },
    async json() {
      return typeof body === 'string' ? JSON.parse(body) : body;
    },
    async text() {
      return textBody;
    }
  };
}

assert.equal(extractLorePrIdFromUrl('https://github.com/Alien-Worlds/the-lore/pull/104'), 104);
assert.equal(extractLorePrIdFromUrl('https://github.com/Alien-Worlds/the-lore/pull/104/files'), 104);
assert.equal(extractLorePrIdFromUrl('https://github.com/someone/the-lore/pull/104'), null);
assert.equal(extractLorePrIdFromUrl('https://github.com/Alien-Worlds/other/pull/104'), null);

const selected = selectNarrativeFile([
  { filename: 'README.md', status: 'modified' },
  { filename: 'stories/eyeke.md', status: 'added' }
]);
assert.equal(selected.strategy, 'file');
assert.equal(selected.file.filename, 'stories/eyeke.md');

const ambiguous = selectNarrativeFile([
  { filename: 'a.md', status: 'added' },
  { filename: 'b.md', status: 'added' }
]);
assert.equal(ambiguous.strategy, 'ambiguous');
assert.equal(ambiguous.reason, 'multiple_non_readme_markdown_files');

const addedReadmeParagraph = 'A newly added canonical paragraph with enough detail to represent a real narrative transmission, maintain provenance, and avoid mistaking tiny README edits for complete lore. '.repeat(8).trim();
const patch = [
  '@@ -1,3 +1,5 @@',
  ' existing line',
  '-removed old sentence',
  '+# New Lore',
  `+${addedReadmeParagraph}`,
  ' unchanged line'
].join('\n');
assert.equal(extractAddedMarkdownFromPatch(patch), `# New Lore\n${addedReadmeParagraph}`);

const unifiedDiff = [
  'diff --git a/README.md b/README.md',
  'index 111..222 100644',
  '--- a/README.md',
  '+++ b/README.md',
  '@@ -1 +1,3 @@',
  ' unchanged',
  '+# Diff Lore',
  `+${addedReadmeParagraph}`,
  'diff --git a/CODEOWNERS b/CODEOWNERS',
  '--- a/CODEOWNERS',
  '+++ b/CODEOWNERS',
  '+unrelated'
].join('\n');
assert.equal(extractAddedMarkdownFromUnifiedDiff(unifiedDiff, 'README.md'), `# Diff Lore\n${addedReadmeParagraph}`);

assert.equal(extractNarrativeTitle('## **The Elgem Species**\n\nBody', 'fallback'), 'The Elgem Species');
assert.equal(extractNarrativeTitle('No heading here', 'PR_Title'), 'PRTitle');

const apiRoot = 'https://api.github.com/repos/Alien-Worlds/the-lore';
const markdown = '# Eyeke: The Second Earth\n\n' + 'This is the authoritative narrative body for the Eyeke transmission, preserving exact provenance and enough story material to qualify as a complete lore record. '.repeat(8);
const calls = [];
const fetchImpl = async (url) => {
  calls.push(String(url));
  if (String(url) === `${apiRoot}/pulls/104/files?per_page=100`) {
    return mockResponse([
      {
        filename: 'Eyeke_The_Second_Earth.md',
        status: 'added',
        contents_url: 'https://api.github.test/content/104',
        raw_url: 'https://raw.github.test/content/104'
      }
    ]);
  }
  if (String(url) === 'https://api.github.test/content/104') {
    return mockResponse(markdown, { contentType: 'text/plain' });
  }
  if (String(url) === `${apiRoot}/pulls/104`) {
    return mockResponse({ title: 'Eyeke_The_Second_Earth', user: { login: 'TechieDrixx' }, head: { sha: 'abc123' } });
  }
  throw new Error(`Unexpected mock URL: ${url}`);
};

const resolved = await resolveGitHubPrNarrative(104, { fetchImpl });
assert.equal(resolved.status, 'resolved');
assert.equal(resolved.file_path, 'Eyeke_The_Second_Earth.md');
assert.equal(resolved.content, markdown.trim());
assert.equal(resolved.author, 'TechieDrixx');
assert.equal(resolved.title, 'Eyeke: The Second Earth');
assert.equal(resolved.content_sha256, hashNarrative(markdown.trim()));
assert.equal(resolved.content_sha256.length, 64);
assert.equal(calls.length, 3);

const readmeFetch = async (url) => {
  if (String(url) === `${apiRoot}/pulls/7/files?per_page=100`) {
    return mockResponse([{ filename: 'README.md', status: 'modified', patch }]);
  }
  if (String(url) === `${apiRoot}/pulls/7`) {
    return mockResponse({ title: 'README lore addition', user: { login: 'scribe' }, head: { sha: 'def456' } });
  }
  throw new Error(`Unexpected mock URL: ${url}`);
};
const readmeResolved = await resolveGitHubPrNarrative(7, { fetchImpl: readmeFetch });
assert.equal(readmeResolved.status, 'resolved');
assert.equal(readmeResolved.source_kind, 'github_readme_patch');
assert.equal(readmeResolved.content, `# New Lore\n${addedReadmeParagraph}`);
assert.ok(!readmeResolved.content.includes('existing line'));
assert.ok(!readmeResolved.content.includes('removed old sentence'));


let readmeDiffCalls = 0;
const incompleteReadmeFetch = async (url, init = {}) => {
  if (String(url) === `${apiRoot}/pulls/8/files?per_page=100`) {
    return mockResponse([{ filename: 'README.md', status: 'modified', additions: 40, patch: '@@ -1 +1,2 @@\n+# Partial only' }]);
  }
  if (String(url) === `${apiRoot}/pulls/8` && String(init?.headers?.Accept || '').includes('diff')) {
    readmeDiffCalls += 1;
    return mockResponse(unifiedDiff, { contentType: 'text/plain' });
  }
  if (String(url) === `${apiRoot}/pulls/8`) {
    return mockResponse({ title: 'Complete README addition', user: { login: 'scribe' }, head: { sha: 'ghi789' } });
  }
  throw new Error(`Unexpected mock URL: ${url}`);
};
const diffRecovered = await resolveGitHubPrNarrative(8, { fetchImpl: incompleteReadmeFetch });
assert.equal(diffRecovered.status, 'resolved');
assert.equal(diffRecovered.title, 'Diff Lore');
assert.equal(diffRecovered.content, `# Diff Lore\n${addedReadmeParagraph}`);
assert.equal(readmeDiffCalls, 1);

let ambiguityCallCount = 0;
const ambiguityFetch = async (url) => {
  ambiguityCallCount += 1;
  if (String(url).includes('/pulls/50/files')) {
    return mockResponse([
      { filename: 'story-one.md', status: 'added' },
      { filename: 'story-two.md', status: 'added' }
    ]);
  }
  throw new Error('Resolver must not guess after an ambiguous file list');
};
const unresolvedAmbiguity = await resolveGitHubPrNarrative(50, { fetchImpl: ambiguityFetch });
assert.equal(unresolvedAmbiguity.status, 'ambiguous');
assert.equal(unresolvedAmbiguity.content, '');
assert.equal(ambiguityCallCount, 1);


let paginationCalls = 0;
const paginationFetch = async (url) => {
  paginationCalls += 1;
  if (String(url).includes('/pulls/88/files')) {
    return mockResponse(
      [{ filename: 'first-page-story.md', status: 'added' }],
      { headers: { Link: '<https://api.github.com/repositories/1/pulls/88/files?per_page=100&page=2>; rel="next"' } }
    );
  }
  throw new Error('Resolver must not choose from a paginated partial file list');
};
const paginated = await resolveGitHubPrNarrative(88, { fetchImpl: paginationFetch });
assert.equal(paginated.status, 'unresolved');
assert.equal(paginated.reason, 'changed_file_list_paginated');
assert.equal(paginationCalls, 1);


const notFoundFetch = async () => mockResponse({ message: 'Not Found' }, { status: 404 });
const notFound = await resolveGitHubPrNarrative(9999, { fetchImpl: notFoundFetch });
assert.equal(notFound.status, 'unresolved');
assert.equal(notFound.reason, 'github_pr_not_found');
assert.equal(notFound.http_status, 404);

console.log('GitHub narrative resolver tests passed.');
