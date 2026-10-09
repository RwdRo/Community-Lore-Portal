import { createHash } from 'node:crypto';

export const GITHUB_LORE_REPO = 'Alien-Worlds/the-lore';
const API_ROOT = `https://api.github.com/repos/${GITHUB_LORE_REPO}`;
const DEFAULT_TIMEOUT_MS = 8000;

export function normalizePrId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function extractLorePrIdFromUrl(url = '') {
  const match = String(url).match(/github\.com\/Alien-Worlds\/the-lore\/pull\/(\d+)(?:\/|$|[?#])/i);
  return match ? normalizePrId(match[1]) : null;
}

function isMarkdownFile(file) {
  const name = String(file?.filename || '').toLowerCase();
  return (name.endsWith('.md') || name.endsWith('.markdown')) && file?.status !== 'removed';
}

function isReadmeFile(file) {
  const name = String(file?.filename || '').replace(/\\/g, '/').split('/').pop()?.toLowerCase();
  return name === 'readme.md' || name === 'readme.markdown';
}

/**
 * Choose a narrative source without title similarity or any other fuzzy guess.
 * A non-README markdown file is usable only when the choice is unambiguous.
 */
export function selectNarrativeFile(files) {
  const markdown = Array.isArray(files) ? files.filter(isMarkdownFile) : [];
  const nonReadme = markdown.filter((file) => !isReadmeFile(file));

  if(nonReadme.length===1 && nonReadme[0].status==='renamed' && isReadmeFile({filename:nonReadme[0].previous_filename})){
    return {strategy:'readme_patch',file:nonReadme[0],reason:'readme_renamed_to_story_extract_changes_only'};
  }
  if (nonReadme.length === 1) {
    return { strategy: 'file', file: nonReadme[0], reason: 'single_non_readme_markdown' };
  }

  const addedNonReadme = nonReadme.filter((file) => file.status === 'added');
  if (addedNonReadme.length === 1) {
    return { strategy: 'file', file: addedNonReadme[0], reason: 'single_added_non_readme_markdown' };
  }

  if (nonReadme.length > 1) {
    return {
      strategy: 'ambiguous',
      file: null,
      reason: 'multiple_non_readme_markdown_files',
      candidates: nonReadme.map((file) => file.filename)
    };
  }

  if (markdown.length === 1 && isReadmeFile(markdown[0])) {
    return { strategy: 'readme_patch', file: markdown[0], reason: 'readme_only_markdown_change' };
  }

  if (markdown.length > 1) {
    return {
      strategy: 'ambiguous',
      file: null,
      reason: 'multiple_markdown_files_without_unique_story_file',
      candidates: markdown.map((file) => file.filename)
    };
  }

  return { strategy: 'none', file: null, reason: 'no_markdown_change' };
}

/**
 * For README-only PRs, use only lines explicitly added by the PR patch.
 * This is provenance-preserving: unchanged README content is never attributed
 * to the PR merely because it exists on the branch.
 */
export function extractAddedMarkdownFromPatch(patch = '') {
  if (!patch || typeof patch !== 'string') return '';

  const lines = [];
  for (const line of patch.split(/\r?\n/)) {
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) continue;
    if (line.startsWith('+')) lines.push(line.slice(1));
  }

  return lines.join('\n').trim();
}


export function extractNarrativeTitle(content = '', fallback = '') {
  const text = String(content || '').replace(/\r\n/g, '\n');
  for (const line of text.split('\n').slice(0, 40)) {
    const heading = line.match(/^\s*#{1,3}\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const clean = heading[1]
        .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
        .replace(/[*_`]/g, '')
        .trim();
      if (clean.length >= 2 && clean.length <= 180) return clean;
    }
  }
  return String(fallback || '').replace(/[*_`]/g, '').trim();
}

function readmeAdditionLooksLikeNarrative(content = '') {
  const text = String(content || '').trim();
  const clean = text.replace(/[#*_`>\[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
  const hasHeading = /^\s*#{1,3}\s+\S+/m.test(text);
  return hasHeading && clean.length >= 120 && clean.split(/\s+/).filter(Boolean).length >= 18;
}

function countAddedPatchLines(patch = '') {
  return String(patch || '').split(/\r?\n/).filter(line => line.startsWith('+') && !line.startsWith('+++')).length;
}

export function extractAddedMarkdownFromUnifiedDiff(diff = '', filename = 'README.md') {
  if (!diff || !filename) return '';
  const normalized = String(filename).replace(/\\/g, '/');
  const sections = String(diff).split(/^diff --git /m).slice(1);
  const section = sections.find(part => {
    const firstLine = part.split(/\r?\n/, 1)[0] || '';
    return firstLine.includes(`a/${normalized} b/${normalized}`) || part.split(/\r?\n/).some(line=>line.replace(/\t.*$/, '')==='+++ b/'+normalized);
  });
  if (!section) return '';
  return extractAddedMarkdownFromPatch(section);
}

export function hashNarrative(content) {
  return createHash('sha256').update(String(content || ''), 'utf8').digest('hex');
}

function githubHeaders(token, accept = 'application/vnd.github+json') {
  const headers = {
    Accept: accept,
    'User-Agent': 'Loreworks/1.0',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function fetchWithTimeout(fetchImpl, url, init = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function readApiError(response) {
  let detail = '';
  try {
    const text = await response.text();
    if (text) detail = text.slice(0, 240);
  } catch {}
  return detail;
}

async function fetchJsonResponse(fetchImpl, url, token, timeoutMs) {
  const response = await fetchWithTimeout(fetchImpl, url, { headers: githubHeaders(token) }, timeoutMs);
  if (!response.ok) {
    const detail = await readApiError(response);
    const rateLimited = response.status === 403 || response.status === 429;
    const error = new Error(`GitHub request failed (${response.status})${detail ? `: ${detail}` : ''}`);
    error.code = rateLimited ? 'GITHUB_RATE_LIMITED' : 'GITHUB_HTTP_ERROR';
    error.status = response.status;
    throw error;
  }
  return {
    data: await response.json(),
    link: response.headers?.get?.('link') || ''
  };
}

async function fetchJson(fetchImpl, url, token, timeoutMs) {
  const result = await fetchJsonResponse(fetchImpl, url, token, timeoutMs);
  return result.data;
}

async function fetchMarkdownFile(fetchImpl, file, token, timeoutMs) {
  if (file?.contents_url) {
    const response = await fetchWithTimeout(
      fetchImpl,
      file.contents_url,
      { headers: githubHeaders(token, 'application/vnd.github.raw+json') },
      timeoutMs
    );
    if (response.ok) {
      const contentType = response.headers?.get?.('content-type') || '';
      const text = await response.text();
      if (contentType.includes('application/json') || text.trim().startsWith('{')) {
        try {
          const payload = JSON.parse(text);
          if (payload?.content && payload?.encoding === 'base64') {
            return Buffer.from(payload.content.replace(/\s/g, ''), 'base64').toString('utf8');
          }
        } catch {
          // It may simply be markdown beginning with a brace; fall through.
        }
      }
      if (text.trim()) return text;
    }
  }

  if (file?.raw_url) {
    const response = await fetchWithTimeout(fetchImpl, file.raw_url, { headers: githubHeaders(token, 'text/plain') }, timeoutMs);
    if (response.ok) return response.text();
  }

  return '';
}

async function fetchPullDiff(fetchImpl, prId, token, timeoutMs) {
  const response = await fetchWithTimeout(
    fetchImpl,
    `${API_ROOT}/pulls/${prId}`,
    { headers: githubHeaders(token, 'application/vnd.github.v3.diff') },
    timeoutMs
  );
  if (!response.ok) return '';
  return response.text();
}

function cleanNarrative(content) {
  const text = String(content || '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text)) return '';
  return text;
}

/**
 * Resolve one exact GitHub PR to narrative markdown.
 * No title matching, proposal-number substitution or nearby-story fallback is
 * permitted here. Failure is returned explicitly as an unresolved status.
 */
export async function resolveGitHubPrNarrative(prId, options = {}) {
  const id = normalizePrId(prId);
  if (!id) {
    return { pr_id: null, status: 'invalid_pr_id', content: '', reason: 'invalid_pr_id' };
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    return { pr_id: id, status: 'unavailable', content: '', reason: 'fetch_unavailable' };
  }

  const token = options.token || process.env.GITHUB_TOKEN || '';
  const timeoutMs = Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS;
  const prUrl = `https://github.com/${GITHUB_LORE_REPO}/pull/${id}`;

  try {
    const filePage = await fetchJsonResponse(fetchImpl, `${API_ROOT}/pulls/${id}/files?per_page=100`, token, timeoutMs);
    // Never decide narrative identity from an incomplete changed-file list.
    // A PR with >100 changed files is rare for lore, but if it occurs we fail
    // closed rather than potentially selecting the wrong markdown file.
    if (/rel="next"/i.test(filePage.link)) {
      return {
        pr_id: id,
        pr_url: prUrl,
        status: 'unresolved',
        content: '',
        reason: 'changed_file_list_paginated'
      };
    }
    const files = filePage.data;
    const selection = selectNarrativeFile(files);

    if (selection.strategy === 'ambiguous' || selection.strategy === 'none') {
      return {
        pr_id: id,
        pr_url: prUrl,
        status: selection.strategy === 'ambiguous' ? 'ambiguous' : 'unresolved',
        content: '',
        reason: selection.reason,
        candidates: selection.candidates || []
      };
    }

    let content = '';
    let sourceKind = '';
    const file = selection.file;

    if (selection.strategy === 'file') {
      content = cleanNarrative(await fetchMarkdownFile(fetchImpl, file, token, timeoutMs));
      sourceKind = 'github_file';
    } else if (selection.strategy === 'readme_patch') {
      let added = extractAddedMarkdownFromPatch(file?.patch || '');
      const expectedAdditions = Number(file?.additions) || 0;
      const patchLooksIncomplete = expectedAdditions > 0 && countAddedPatchLines(file?.patch || '') < expectedAdditions;

      // GitHub may omit or truncate `patch` for large README changes. In that
      // exact-source case, request the PR unified diff and extract additions
      // only from the same README file instead of falling back to current HEAD.
      if (!added || patchLooksIncomplete) {
        try {
          const diff = await fetchPullDiff(fetchImpl, id, token, timeoutMs);
          const completeAdded = extractAddedMarkdownFromUnifiedDiff(diff, file?.filename || 'README.md');
          if (completeAdded) added = completeAdded;
        } catch {
          // Fail closed below if the exact diff cannot be recovered.
        }
      }

      content = cleanNarrative(added);
      sourceKind = 'github_readme_patch';
    }

    if (!content) {
      return {
        pr_id: id,
        pr_url: prUrl,
        status: 'unresolved',
        content: '',
        file_path: file?.filename || '',
        reason: selection.strategy === 'readme_patch' ? 'readme_patch_missing_or_empty' : 'story_file_unreadable'
      };
    }

    // An exact dedicated markdown file is itself strong identity evidence. For
    // README-only PRs, require a heading and a minimally complete addition so
    // a typo fix or tiny fragment cannot masquerade as a lore chapter.
    if (selection.strategy === 'readme_patch' && !readmeAdditionLooksLikeNarrative(content)) {
      return {
        pr_id: id,
        pr_url: prUrl,
        status: 'unresolved',
        content: '',
        file_path: file?.filename || '',
        reason: 'readme_addition_not_complete_narrative'
      };
    }

    let metadata = {};
    try {
      metadata = await fetchJson(fetchImpl, `${API_ROOT}/pulls/${id}`, token, timeoutMs);
    } catch {
      // Narrative identity is still exact without optional display metadata.
    }

    return {
      pr_id: id,
      pr_url: prUrl,
      status: 'resolved',
      reason: selection.reason,
      source_kind: sourceKind,
      file_path: file?.filename || '',
      title: extractNarrativeTitle(content, metadata?.title || ''),
      author: metadata?.user?.login || '',
      head_sha: metadata?.head?.sha || '',
      content,
      content_sha256: hashNarrative(content)
    };
  } catch (error) {
    const httpStatus = Number(error?.status || 0);
    const status = error?.code === 'GITHUB_RATE_LIMITED'
      ? 'rate_limited'
      : httpStatus === 404
        ? 'unresolved'
        : 'unavailable';
    return {
      pr_id: id,
      pr_url: prUrl,
      status,
      content: '',
      reason: httpStatus === 404 ? 'github_pr_not_found' : (error?.code || 'github_request_failed'),
      http_status: httpStatus || undefined,
      error: String(error?.message || error)
    };
  }
}
