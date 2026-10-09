import verifiedPrSources from './data/verified_pr_sources.json';
import {fetchTableSnapshot} from './chainSnapshot';
import { getDatabase, persistDatabase } from "./db";
import fs from "fs";
import path from "path";
import { resolveGitHubPrNarrative, hashNarrative } from "./githubPrNarrative.js";

const WAX_RPC_ENDPOINTS = [
  "https://api.waxsweden.org",
  "https://wax.greymass.com",
  "https://wax.api.eosnation.io",
  "https://wax.eosphere.io",
  "https://wax.eu.eosamsterdam.net"
];

const WAX_HYPERION_ENDPOINTS = [
  "https://api.waxsweden.org",
  "https://wax.eu.eosamsterdam.net",
  "https://wax.eosusa.news",
  "https://hyperion.wax.blacklusion.io"
];

export interface ProposalRow {
  proposal_id: number;
  proposer: string;
  type: string;
  status: string;
  title: string;
  total_yes_votes: string;
  total_no_votes: string;
  number_yes_votes: number;
  number_no_votes: number;
  expires: string;
  earliest_exec: string;
  attributes: Array<{ key: string; value: [string, any] }>;
}

let cachedLegacyPrStories: Record<string, any> | null = null;

function safeParseJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf-8");
    try {
      return JSON.parse(raw);
    } catch {
      try {
        const sanitized = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
        return JSON.parse(sanitized);
      } catch {
        return fallback;
      }
    }
  } catch (e) {
    console.warn(`Could not read or parse ${filePath}:`, e);
    return fallback;
  }
}

function getLegacyPrStories(): Record<string, any> {
  if (cachedLegacyPrStories) return cachedLegacyPrStories;
  const prPath = path.join(process.cwd(), "server", "data", "pr_stories.json");
  cachedLegacyPrStories = safeParseJsonFile<Record<string, any>>(prPath, {});
  return cachedLegacyPrStories || {};
}

export async function fetchWaxTableRows(code = "lore.worlds", scope = "lore.worlds", table = "tokelores", limit = 500): Promise<any[]> {
 return fetchTableSnapshot(WAX_RPC_ENDPOINTS,{json:true,code,scope,table,limit});
}

export async function fetchHyperionActions(account = "lore.worlds", limit = 50): Promise<any[]> {
  for (const endpoint of WAX_HYPERION_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const response = await fetch(`${endpoint}/v2/history/get_actions?account=${account}&limit=${limit}&sort=desc`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (response.ok) {
        const data = await response.json();
        if (data.actions && Array.isArray(data.actions)) {
          return data.actions;
        }
      }
    } catch {
      // Try next endpoint
    }
  }
  return [];
}

function parseAttributes(attributes: Array<{ key: string; value: [string, any] }>): { description: string; url: string; pull_req_id: number; ipfs_cid: string } {
  let description = "";
  let url = "";
  let pull_req_id = 0;
  let ipfs_cid = "";

  if (Array.isArray(attributes)) {
    for (const attr of attributes) {
      const key = String(attr.key || "").toLowerCase();
      const value = attr.value && attr.value[1] != null ? String(attr.value[1]).trim() : "";
      if (!value) continue;

      if (key === "description") {
        description = value;
      } else if (key === "url") {
        url = value;
      } else if (key === "pull_req_id") {
        pull_req_id = Number(value) || 0;
      } else if (key === "ipfs" || key === "ipfs_cid" || key === "cid") {
        ipfs_cid = normalizeIpfsCid(value);
      }
    }
  }
  return { description, url, pull_req_id, ipfs_cid };
}

function normalizeIpfsCid(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("ipfs://")) return trimmed.slice("ipfs://".length).split(/[/?#]/)[0];
  const gatewayMatch = trimmed.match(/\/ipfs\/([^/?#]+)/i);
  if (gatewayMatch) return gatewayMatch[1];
  return trimmed;
}

function detectPlanet(title: string, description: string): string {
  // Governance metadata is not narrative indexing authority. Only file a
  // record under a world when exactly one supported world is explicit in the
  // title or opening text. Ambiguity remains Federation/unassigned.
  const worlds = [
    { name: "Eyeke", aliases: ["Eyeke"] },
    { name: "Kavian", aliases: ["Kavian"] },
    { name: "Magor", aliases: ["Magor"] },
    { name: "Naron", aliases: ["Naron"] },
    { name: "Neri", aliases: ["Neri"] },
    { name: "Veles", aliases: ["Veles"] },
    { name: "Alta", aliases: ["Alta", "Alta Prime"] },
    { name: "Khaur", aliases: ["Khaur"] },
    { name: "Velgemmis", aliases: ["Velgemmis"] },
    { name: "Lopat", aliases: ["Lopat"] },
    { name: "Earth", aliases: ["Earth"] },
    { name: "Alfrheim", aliases: ["Alfrheim"] },
    { name: "New Pleione", aliases: ["New Pleione"] },
    { name: "Nyssari", aliases: ["Nyssari"] },
  ];
  const containsExact = (text: string, alias: string) => {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^A-Za-z0-9])${escaped}(?=$|[^A-Za-z0-9])`, 'i').test(text);
  };
  const matchingWorlds = (text: string) => worlds.filter(world => world.aliases.some(alias => containsExact(text, alias)));

  const titleMatches = matchingWorlds(String(title || ''));
  if (titleMatches.length === 1) return titleMatches[0].name;

  const opening = String(description || '').slice(0, 1100);
  const strongOpeningMatches = worlds.filter(world => world.aliases.some(alias => {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`\b(?:planet|world)\s+${escaped}\b`, 'i'),
      new RegExp(`\b${escaped}(?:'s|’s)\b`, 'i'),
      new RegExp(`\b${escaped}\s+(?:is|was|became|remains|orbits|entered)\b`, 'i'),
      new RegExp(`\b(?:on|upon|across|within|beneath|above|around|at)\s+(?:the\s+(?:planet|world)\s+)?${escaped}\b`, 'i'),
    ];
    return patterns.some(pattern => pattern.test(opening));
  }));
  return strongOpeningMatches.length === 1 ? strongOpeningMatches[0].name : "Federation";
}
function extractReferencedPrId(pullReqId: number, url = ""): number | null {
  if (Number.isInteger(pullReqId) && pullReqId > 0) return pullReqId;

  if (url) {
    const prMatch = url.match(/github\.com\/Alien-Worlds\/the-lore\/pull\/(\d+)/i);
    if (prMatch) {
      const parsed = Number(prMatch[1]);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
    }
  }

  return null;
}

type NarrativeResolution = {
  content: string | null;
  status: string;
  reason: string;
  networkAttempted: boolean;
};

function getCachedPrSource(db: any, prId: number): any | null {
  const result = db.exec(
    `SELECT pr_id, pr_url, title, author, head_sha, file_path, source_kind, content, content_sha256, resolution_status, resolution_reason, candidates_json, last_attempt_status, last_attempt_reason, last_attempt_at, updated_at
     FROM github_pr_sources WHERE pr_id = ? LIMIT 1`,
    [prId]
  );
  if (!result.length || !result[0].values.length) return null;
  const row: any = {};
  result[0].columns.forEach((column: string, index: number) => {
    row[column] = result[0].values[0][index];
  });
  return row;
}

function storePrSource(db: any, source: any) {
  const prId = Number(source?.pr_id);
  if (!Number.isInteger(prId) || prId <= 0) return;

  const now = Date.now();
  db.run(
    `INSERT OR REPLACE INTO github_pr_sources
     (pr_id, pr_url, title, author, head_sha, file_path, source_kind, content, content_sha256, resolution_status, resolution_reason, candidates_json, last_attempt_status, last_attempt_reason, last_attempt_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      prId,
      source.pr_url || `https://github.com/Alien-Worlds/the-lore/pull/${prId}`,
      source.title || "",
      source.author || "",
      source.head_sha || "",
      source.file_path || "",
      source.source_kind || "",
      source.content || "",
      source.content_sha256 || (source.content ? hashNarrative(source.content) : ""),
      source.status || "unresolved",
      source.reason || "",
      JSON.stringify(source.candidates || []),
      source.status || "unresolved",
      source.reason || "",
      now,
      now
    ]
  );
}

function recordPrAttempt(db: any, prId: number, status: string, reason: string) {
  db.run(
    `UPDATE github_pr_sources
     SET last_attempt_status = ?, last_attempt_reason = ?, last_attempt_at = ?
     WHERE pr_id = ?`,
    [status, reason, Date.now(), prId]
  );
}

function legacyStoryForPr(prId: number): any | null {
  const story = getLegacyPrStories()[String(prId)];
  return story?.content ? story : null;
}

async function resolveReferencedStory(
  db: any,
  pullReqId: number,
  url = "",
  allowNetwork = true
): Promise<NarrativeResolution> {
  const referencedPrId = extractReferencedPrId(pullReqId, url);
  if (!referencedPrId) {
    return { content: null, status: "unreferenced", reason: "no_explicit_pr_reference", networkAttempted: false };
  }

  const pinned=(verifiedPrSources as Record<string,any>)[String(referencedPrId)];
  const current=getCachedPrSource(db,referencedPrId);
  if(pinned && (current?.source_kind!==pinned.source_kind||current?.content_sha256!==pinned.content_sha256)){storePrSource(db,pinned);}
  const cached = getCachedPrSource(db, referencedPrId);
  const now = Date.now();
  const configuredTtlHours = Number(process.env.GITHUB_SOURCE_TTL_HOURS);
  const ttlHours = Number.isFinite(configuredTtlHours) && configuredTtlHours > 0 ? configuredTtlHours : 24;
  const ttlMs = ttlHours * 60 * 60 * 1000;
  const cacheFresh = cached && Number(cached.updated_at || 0) > now - ttlMs;

  // Only authoritative GitHub-resolved content is served by default. A legacy
  // salvage cache is available solely when explicitly enabled for forensic use.
  const allowLegacySalvage = process.env.LEGACY_PR_SALVAGE_ENABLED === "true";
  const cachedStatus = String(cached?.resolution_status || "");
  const cachedAllowed = cachedStatus === "resolved" || (allowLegacySalvage && cachedStatus === "legacy_salvage");
  if (cached?.content && cachedAllowed && cacheFresh) {
    return {
      content: String(cached.content),
      status: cachedStatus,
      reason: cachedStatus === "resolved" ? "github_cache" : "legacy_salvage_cache",
      networkAttempted: false
    };
  }

  // Avoid hammering GitHub on every sync after a transient or structurally
  // unresolved result. Negative cache entries expire much sooner than content.
  const configuredFailureTtl = Number(process.env.GITHUB_FAILURE_TTL_MINUTES);
  const failureTtlMinutes = Number.isFinite(configuredFailureTtl) && configuredFailureTtl >= 0 ? configuredFailureTtl : 15;
  const failureFresh = cached && Number(cached.last_attempt_at || cached.updated_at || 0) > now - failureTtlMinutes * 60 * 1000;
  if (!cached?.content && failureFresh && ["rate_limited", "unavailable", "ambiguous", "unresolved"].includes(String(cached?.resolution_status))) {
    return {
      content: null,
      status: String(cached.resolution_status),
      reason: String(cached.resolution_reason || "narrative_source_unresolved"),
      networkAttempted: false
    };
  }

  // If the content itself is stale but a refresh just failed transiently, do
  // not retry on every minute-level sync. The valid exact source remains usable
  // while the short refresh-failure TTL suppresses another network attempt.
  const transientRefreshFresh = cached?.content
    && cachedAllowed
    && failureFresh
    && ["rate_limited", "unavailable"].includes(String(cached.last_attempt_status));
  if (transientRefreshFresh) {
    return {
      content: String(cached.content),
      status: String(cached.resolution_status || "resolved"),
      reason: `stale_cache_after_${String(cached.last_attempt_status)}`,
      networkAttempted: false
    };
  }

  let networkAttempted = false;
  if (allowNetwork && process.env.GITHUB_SYNC_ENABLED !== "false") {
    networkAttempted = true;
    const resolved = await resolveGitHubPrNarrative(referencedPrId, { token: process.env.GITHUB_TOKEN || "" });
    if (resolved?.status === "resolved" && resolved?.content) {
      storePrSource(db, resolved);
      return { content: String(resolved.content), status: "resolved", reason: String(resolved.reason || "github_exact_pr"), networkAttempted };
    }

    const structuralFailure = ["ambiguous", "unresolved", "invalid_pr_id"].includes(String(resolved?.status));
    if (structuralFailure) {
      // GitHub answered, but the exact PR cannot currently be mapped to one
      // authoritative narrative. Invalidate stale content rather than serving it.
      storePrSource(db, resolved);
      return {
        content: null,
        status: String(resolved?.status || "unresolved"),
        reason: String(resolved?.reason || "narrative_source_unresolved"),
        networkAttempted
      };
    }

    if (cached?.content) {
      // A rate limit or network outage must not destroy a previously verified
      // exact source. Record the failed refresh separately and serve stale-safe
      // content until GitHub can be checked again.
      recordPrAttempt(
        db,
        referencedPrId,
        String(resolved?.status || "unavailable"),
        String(resolved?.reason || "github_refresh_failed")
      );
      return {
        content: String(cached.content),
        status: String(cached.resolution_status || "resolved"),
        reason: `stale_cache_after_${String(resolved?.status || "unavailable")}`,
        networkAttempted
      };
    }

    // With no prior content, retain the failed attempt for short negative-cache
    // throttling. An exact-ID legacy salvage may still be used below.
    storePrSource(db, resolved);
  }

  // Legacy salvage is disabled by default. Even exact numeric keys came from a
  // damaged export and must never silently outrank an unresolved authoritative
  // source. It can be enabled explicitly for forensic/offline review only.
  const legacy = allowLegacySalvage ? legacyStoryForPr(referencedPrId) : null;
  if (legacy) {
    const content = String(legacy.content);
    storePrSource(db, {
      pr_id: referencedPrId,
      pr_url: legacy.pr_url || `https://github.com/Alien-Worlds/the-lore/pull/${referencedPrId}`,
      title: legacy.title || "",
      author: legacy.author || "",
      file_path: "",
      source_kind: "legacy_salvage",
      content,
      content_sha256: hashNarrative(content),
      status: "legacy_salvage",
      reason: "exact_pr_keyed_salvage"
    });
    return { content, status: "legacy_salvage", reason: "exact_pr_keyed_salvage", networkAttempted };
  }

  const latest = getCachedPrSource(db, referencedPrId);
  return {
    content: null,
    status: String(latest?.resolution_status || "unresolved"),
    reason: String(latest?.resolution_reason || "narrative_source_unresolved"),
    networkAttempted
  };
}

export async function syncWaxProposals(): Promise<number> {
  const db = await getDatabase();
  let insertedCount = 0;
  let sourceRefreshed = false;
  const now = Date.now();
  const configuredGithubBudget = Number(process.env.GITHUB_SYNC_MAX_PER_CYCLE);
  let githubNetworkBudget = Number.isFinite(configuredGithubBudget)
    ? Math.max(0, Math.floor(configuredGithubBudget))
    : 10;

  // 1. Fetch real rows exclusively from lore.worlds tokelores table
  try {
    const rows: ProposalRow[] = await fetchWaxTableRows("lore.worlds", "lore.worlds", "tokelores", 500);
    sourceRefreshed = true;
    if (rows && rows.length > 0) {
      for (const row of rows) {
        const propId = Number(row.proposal_id);
        const id = `lore_worlds_${propId}`;
        const proposer = String(row.proposer || "unknown");
        const title = String(row.title || `Proposal #${propId}`).trim();
        const { description, url, pull_req_id, ipfs_cid } = parseAttributes(row.attributes);
        const status = String(row.status || "active");
        
        // Parse numerical votes
        const yesVp = parseFloat(String(row.total_yes_votes || "0")) || 0;
        const noVp = parseFloat(String(row.total_no_votes || "0")) || 0;
        const numYesVotes = Number(row.number_yes_votes) || 0;
        const numNoVotes = Number(row.number_no_votes) || 0;
        
        let planet = detectPlanet(title, description);

        // Status normalized for UI badges: executed/complete -> passed, active/voting -> active, quorum.unmet/rejected -> quorum unmet
        const statusMap: Record<string, string> = {
          complete: "passed",
          executed: "passed",
          active: "active",
          voting: "active",
          "quorum.unmet": "quorum unmet",
          expired: "expired",
          cancelled: "cancelled"
        };
        const statusLabel = statusMap[status.toLowerCase()] || status;

        // Resolve narrative prose only from an explicitly referenced GitHub pull request.
        // Keep source provenance separate from IPFS/content-address metadata.
        const referencedPrId = extractReferencedPrId(pull_req_id, url);
        const sourceUrl = url || (referencedPrId ? `https://github.com/Alien-Worlds/the-lore/pull/${referencedPrId}` : "");
        const narrative = await resolveReferencedStory(db, pull_req_id, url, githubNetworkBudget > 0);
        if (narrative.networkAttempted) githubNetworkBudget = Math.max(0, githubNetworkBudget - 1);

        // Once an exact PR has been resolved, its own title/body outrank the
        // governance summary for world placement. This cannot attach a story
        // to another world merely because the proposal text mentioned it.
        if (referencedPrId && narrative.content) {
          const cachedSource = getCachedPrSource(db, referencedPrId);
          const narrativePlanet = detectPlanet(String(cachedSource?.title || ''), narrative.content);
          if (narrativePlanet !== "Federation") planet = narrativePlanet;
        }

        let finalContent = "";
        if (narrative.content) {
          finalContent = narrative.content;
        } else {
          const sourceNote = referencedPrId
            ? `The proposal references GitHub PR #${referencedPrId}, but Loreworks has not resolved an authoritative narrative body for it yet.`
            : "No explicit GitHub narrative source is attached to this on-chain proposal.";
          const summary = description ? `\n\n**Proposal summary:** ${description}` : "";
          finalContent = `### ${title}\n\n*${sourceNote}*${summary}`;
        }

        db.run(
          `INSERT OR REPLACE INTO proposals 
           (id, proposal_id, proposer, title, content, ipfs_cid, status, status_label, votes_for, votes_against, threshold, planet, created_at, updated_at, raw_json, source_url, pull_request_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            propId,
            proposer,
            title,
            finalContent,
            ipfs_cid,
            status === "complete" || status === "executed" ? 4 : status === "active" ? 1 : 0,
            statusLabel,
            numYesVotes > 0 ? numYesVotes : Math.round(yesVp),
            numNoVotes > 0 ? numNoVotes : Math.round(noVp),
            numYesVotes + numNoVotes,
            planet,
            row.earliest_exec ? new Date(row.earliest_exec).getTime() : now,
            now,
            JSON.stringify(row),
            sourceUrl,
            referencedPrId
          ]
        );
        insertedCount++;
      }
    }
  } catch (err) {
    console.warn("Error querying lore.worlds tokelores table:", err);
  }

  // GitHub pull requests are narrative sources, not WAX governance proposals.
  // They are resolved only when a WAX row explicitly references a pull request.

  // 2. Fetch real Hyperion actions exclusively from lore.worlds contract
  try {
    const actions = await fetchHyperionActions("lore.worlds", 50);
    if (actions && actions.length > 0) {
      for (const act of actions) {
        const actId = `act_${act.global_sequence || act.trx_id || Math.random()}`;
        const actName = act.act?.name || "action";
        const actor = act.act?.authorization?.[0]?.actor || act.act?.data?.proposer || act.act?.data?.voter || "lore.worlds";
        const blockNum = act.block_num || 0;
        const timestamp = act.timestamp || new Date().toISOString();
        const trxId = act.trx_id || "";

        db.run(
          `INSERT OR REPLACE INTO hyperion_actions
           (id, global_sequence, trx_id, block_num, timestamp, action_name, actor, data_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            actId,
            String(act.global_sequence || ""),
            trxId,
            blockNum,
            timestamp,
            actName,
            actor,
            JSON.stringify(act.act?.data || {})
          ]
        );
      }
    }
  } catch {
    // Non-blocking
  }

  // 3. Compute real telemetry directly from database state
  updateGovernanceTelemetry(db, sourceRefreshed);
  persistDatabase();
  return insertedCount;
}

function updateGovernanceTelemetry(db: any, sourceRefreshed: boolean) {
  let previous:any={};
  try { previous=JSON.parse(String(db.exec("SELECT metric_value FROM governance_telemetry WHERE id = 'governance_summary'")[0]?.values[0]?.[0]||'{}')); } catch {}
  const now = Date.now();
  
  const totalResult = db.exec("SELECT COUNT(*) as count FROM proposals");
  const totalCount = totalResult[0]?.values[0]?.[0] || 0;

  const activeResult = db.exec("SELECT COUNT(*) as count FROM proposals WHERE status_label = 'active'");
  const activeCount = activeResult[0]?.values[0]?.[0] || 0;

  const passedResult = db.exec("SELECT COUNT(*) as count FROM proposals WHERE status_label = 'passed'");
  const passedCount = passedResult[0]?.values[0]?.[0] || 0;

  const scribesResult = db.exec("SELECT COUNT(DISTINCT proposer) as count FROM proposals");
  const scribesCount = scribesResult[0]?.values[0]?.[0] || 0;

  const telemetryData = {
    total_proposals: Number(totalCount),
    active_proposals: Number(activeCount),
    passed_proposals: Number(passedCount),
    active_scribes: Number(scribesCount),
    pass_rate_pct: totalCount > 0 ? Math.round((Number(passedCount) / Number(totalCount)) * 100) : 0,
    last_synced: sourceRefreshed ? now : previous.last_synced || null,
    last_attempted: now,
    chain: "WAX Mainnet",
    contract: "lore.worlds",
    table: "tokelores",
    status: sourceRefreshed ? "SOURCE_REFRESHED" : "CACHED_SOURCE_UNAVAILABLE"
  };

  db.run(
    `INSERT OR REPLACE INTO governance_telemetry (id, metric_key, metric_value, updated_at)
     VALUES (?, ?, ?, ?)`,
    ["governance_summary", "governance_summary", JSON.stringify(telemetryData), now]
  );
}
