/**
 * Offline PR corpus recovery utility.
 *
 * This script NEVER overwrites server/data/pr_stories.json. It reconstructs
 * exact PR-ref material from a local clone and writes a reviewable recovery
 * corpus + manifest under server/data/recovery/. No title/marker guessing is
 * allowed.
 *
 * Usage:
 *   LORE_REPO_DIR=/path/to/the-lore node scripts/extract_prs.js
 *
 * Optional:
 *   FETCH_PULL_REFS=1  Fetch GitHub pull-request head refs from origin first.
 *   OUTPUT_DIR=...     Override the recovery output directory.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectNarrativeFile, extractAddedMarkdownFromPatch, hashNarrative } from '../server/githubPrNarrative.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoDir = path.resolve(process.env.LORE_REPO_DIR || '/tmp/the-lore-repo');
const outputDir = path.resolve(process.env.OUTPUT_DIR || path.join(ROOT, 'server/data/recovery'));

function git(args, { maxBuffer = 32 * 1024 * 1024 } = {}) {
  return execFileSync('git', ['-C', repoDir, ...args], { encoding: 'utf8', maxBuffer }).trimEnd();
}

function ensureRepo() {
  if (!fs.existsSync(path.join(repoDir, '.git'))) {
    throw new Error(`No Git repository found at ${repoDir}. Set LORE_REPO_DIR to a local clone of Alien-Worlds/the-lore.`);
  }
}

function fetchPullRefs() {
  if (process.env.FETCH_PULL_REFS !== '1') return;
  execFileSync(
    'git',
    ['-C', repoDir, 'fetch', 'origin', '+refs/pull/*/head:refs/remotes/origin/pr/*'],
    { stdio: 'inherit', maxBuffer: 32 * 1024 * 1024 }
  );
}

function listPrRefs() {
  const text = git(['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin/pr']);
  if (!text.trim()) return [];
  return text
    .split(/\r?\n/)
    .map((ref) => ({ ref, prId: Number(ref.match(/\/pr\/(\d+)$/)?.[1]) }))
    .filter((entry) => Number.isInteger(entry.prId) && entry.prId > 0)
    .sort((a, b) => a.prId - b.prId);
}

function defaultBaseRef() {
  for (const candidate of ['origin/main', 'origin/master']) {
    try {
      git(['rev-parse', '--verify', candidate]);
      return candidate;
    } catch {}
  }
  throw new Error('Could not find origin/main or origin/master in the local lore repository.');
}

function changedMarkdown(base, ref) {
  const names = git(['diff', '--name-status', base, ref, '--', '*.md', '*.markdown']);
  if (!names.trim()) return [];
  return names.split(/\r?\n/).map((line) => {
    const [statusCode, ...rest] = line.split('\t');
    const filename = rest.at(-1) || '';
    const status = statusCode.startsWith('A') ? 'added' : statusCode.startsWith('D') ? 'removed' : 'modified';
    return { filename, status };
  });
}

function commitMeta(ref) {
  const raw = git(['log', '-1', '--format=%H%x00%an%x00%s', ref]);
  const [headSha = '', author = '', subject = ''] = raw.split('\0');
  return { headSha, author, subject };
}

function fileAt(ref, filename) {
  return git(['show', `${ref}:${filename}`]);
}

function readmePatch(base, ref, filename) {
  return git(['diff', '--unified=0', base, ref, '--', filename]);
}

function atomicJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, filePath);
}

function run() {
  ensureRepo();
  fetchPullRefs();
  const refs = listPrRefs();
  if (!refs.length) {
    throw new Error('No origin/pr/<number> refs found. Re-run with FETCH_PULL_REFS=1 when network access is available.');
  }

  const baseRef = defaultBaseRef();
  const corpus = {};
  const manifest = [];

  for (const { ref, prId } of refs) {
    try {
      const mergeBase = git(['merge-base', baseRef, ref]);
      const files = changedMarkdown(mergeBase, ref);
      const selection = selectNarrativeFile(files);
      const meta = commitMeta(ref);
      const prUrl = `https://github.com/Alien-Worlds/the-lore/pull/${prId}`;

      if (selection.strategy === 'ambiguous' || selection.strategy === 'none') {
        manifest.push({
          pr_id: prId,
          pr_url: prUrl,
          status: selection.strategy === 'ambiguous' ? 'ambiguous' : 'unresolved',
          reason: selection.reason,
          candidates: selection.candidates || []
        });
        console.log(`- PR #${prId}: ${selection.reason}`);
        continue;
      }

      let content = '';
      let sourceKind = '';
      if (selection.strategy === 'file') {
        content = fileAt(ref, selection.file.filename).trim();
        sourceKind = 'git_pr_file';
      } else {
        content = extractAddedMarkdownFromPatch(readmePatch(mergeBase, ref, selection.file.filename));
        sourceKind = 'git_readme_patch';
      }

      if (!content) {
        manifest.push({ pr_id: prId, pr_url: prUrl, status: 'unresolved', reason: 'empty_exact_source' });
        console.log(`- PR #${prId}: empty exact source`);
        continue;
      }

      corpus[String(prId)] = {
        pr_id: prId,
        title: meta.subject || `PR #${prId}`,
        author: meta.author || '',
        content,
        length: content.length,
        pr_url: prUrl,
        head_sha: meta.headSha,
        file_path: selection.file.filename,
        source_kind: sourceKind,
        content_sha256: hashNarrative(content)
      };
      manifest.push({
        pr_id: prId,
        pr_url: prUrl,
        status: 'resolved',
        reason: selection.reason,
        file_path: selection.file.filename,
        content_sha256: hashNarrative(content)
      });
      console.log(`+ PR #${prId}: ${selection.file.filename} (${content.length} chars)`);
    } catch (error) {
      manifest.push({ pr_id: prId, status: 'error', reason: String(error?.message || error) });
      console.warn(`! PR #${prId}: ${String(error?.message || error)}`);
    }
  }

  const corpusPath = path.join(outputDir, 'pr_corpus_rebuild.json');
  const manifestPath = path.join(outputDir, 'pr_corpus_rebuild_manifest.json');
  atomicJson(corpusPath, corpus);
  atomicJson(manifestPath, manifest);
  console.log(`\nWrote ${Object.keys(corpus).length} exact-source narratives to ${corpusPath}`);
  console.log(`Wrote ${manifest.length} PR resolution records to ${manifestPath}`);
  console.log('The runtime legacy salvage file was not modified.');
}

try {
  run();
} catch (error) {
  console.error(`PR recovery failed: ${String(error?.message || error)}`);
  process.exit(1);
}
