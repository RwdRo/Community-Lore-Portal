import {portalFetch as fetch} from './pagesRuntime';
import { LoreEntry, LoreCategory, LoreStatus } from "../types";
import { normalizeLoreEntry } from "../constants/loreIndex";

export interface CanonProposal {
  id: string;
  proposal_id: number;
  proposer: string;
  title: string;
  content: string;
  ipfs_cid: string;
  status: number;
  status_label: string;
  votes_for: number;
  votes_against: number;
  threshold: number;
  planet: string;
  created_at: number;
  updated_at: number;
  tx_id?: string;
  raw_json?: string;
  source_url?: string;
  pull_request_id?: number;
  narrative_source_status?: string;
  narrative_source_reason?: string;
  narrative_source_path?: string;
  narrative_source_sha256?: string;
  narrative_title?: string;
  narrative_author?: string;
  narrative_content?: string;
  content_complete?: number | boolean;
  narrative_full_length?: number;
}

export function transformProposalToLoreEntry(prop: CanonProposal): LoreEntry {
  const governanceTitle = (prop.title || `Proposal #${prop.proposal_id}`).trim();
  const hasVerifiedNarrative = prop.narrative_source_status === 'resolved' && !!(prop.narrative_content || prop.content);
  const narrativeTitle = (prop.narrative_title || '').trim();
  const narrativeAuthor = (prop.narrative_author || '').trim();

  // A governance proposal and the narrative it references are distinct records.
  // When an exact GitHub narrative has been resolved, display its own title and
  // author instead of attaching its prose to the governance proposal title.
  const title = hasVerifiedNarrative && narrativeTitle ? narrativeTitle : governanceTitle;
  const content = (hasVerifiedNarrative ? (prop.narrative_content || prop.content) : prop.content || '').trim() || governanceTitle;

  const isPassed = prop.status_label === 'passed' || prop.status === 2 || prop.status === 4 || prop.status_label === 'complete' || prop.status_label === 'executed';
  const isRejected = prop.status_label === 'rejected' || prop.status_label === 'quorum unmet' || prop.status_label === 'expired' || prop.status_label === 'cancelled';
  const status: LoreStatus = isPassed ? 'active' : (isRejected ? 'rejected' : 'in-vote');
  const type = isPassed ? 'canon' : 'proposed';
  const sourceUrl = prop.source_url || (prop.ipfs_cid ? `https://ipfs.io/ipfs/${prop.ipfs_cid}` : undefined);

  const base: LoreEntry = {
    id: prop.id || `onchain_${prop.proposal_id}`,
    title,
    content,
    authorId: hasVerifiedNarrative && narrativeAuthor ? narrativeAuthor : (prop.proposer || 'federation-archive'),
    authorName: hasVerifiedNarrative && narrativeAuthor ? narrativeAuthor : (prop.proposer || 'Federation Scribe'),
    waxAccount: prop.proposer,
    type,
    status,
    category: 'General',
    tags: [],
    createdAt: { seconds: Math.floor((prop.created_at || 0) / 1000) },
    voteCount: (prop.votes_for || 0) - (prop.votes_against || 0),
    proposal_id: prop.proposal_id,
    votes_for: prop.votes_for || 0,
    votes_against: prop.votes_against || 0,
    status_label: prop.status_label,
    planet: prop.planet && prop.planet !== 'Federation' ? prop.planet : undefined,
    onChain: (prop as any).onChain !== false,
    contentComplete: Boolean(prop.content_complete),
    tx_id: prop.tx_id,
    ipfs_cid: prop.ipfs_cid,
    pull_request_id: prop.pull_request_id,
    narrative_source_status: prop.narrative_source_status,
    narrative_source_reason: prop.narrative_source_reason,
    narrative_source_path: prop.narrative_source_path,
    narrative_source_sha256: prop.narrative_source_sha256,
    governanceTitle,
    narrativeTitle: narrativeTitle || undefined,
    narrativeAuthor: narrativeAuthor || undefined,
    sourceUrl
  };

  return normalizeLoreEntry(base);
}

export interface GovernanceTelemetry {
  total_proposals: number;
  active_proposals: number;
  passed_proposals: number;
  active_scribes: number;
  pass_rate_pct: number;
  chain: string;
  contract: string;
  status: string;
  last_synced?: number;
}

export interface CanonGraphNode {
  id: string;
  name: string;
  type: string;
  planet: string;
  faction: string;
  description: string;
}

export interface CanonGraphLink {
  source: string;
  target: string;
  relation: string;
  weight: number;
}

export interface CanonGraphData {
  nodes: CanonGraphNode[];
  links: CanonGraphLink[];
}

export interface HyperionActionItem {
  id: string;
  global_sequence: string;
  trx_id: string;
  block_num: number;
  timestamp: string;
  action_name: string;
  actor: string;
  data: any;
}

export interface PlanetaryMetric {
  planet_id: string;
  planet_name: string;
  active_lore_count: number;
  passed_proposals: number;
  active_scribes: number;
  description: string;
}

export async function fetchCanonProposals(params?: {
  status?: string;
  proposer?: string;
  planet?: string;
  query?: string;
}): Promise<CanonProposal[]> {
  try {
    const url = new URL("/api/canon/proposals", window.location.origin);
    if (params?.status) url.searchParams.set("status", params.status);
    if (params?.proposer) url.searchParams.set("proposer", params.proposer);
    if (params?.planet) url.searchParams.set("planet", params.planet);
    if (params?.query) url.searchParams.set("query", params.query);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error("Failed to fetch canon proposals");
    const json = await res.json();
    return json.data || [];
  } catch (err) {
    console.warn("Error in fetchCanonProposals:", err);
    return [];
  }
}

export async function fetchProposalDetail(id: string | number): Promise<CanonProposal | null> {
  try {
    const res = await fetch(`/api/canon/proposals/${id}`);
    if (!res.ok) throw new Error(`Failed to fetch proposal ${id}`);
    const json = await res.json();
    return json.data || null;
  } catch (err) {
    console.warn("Error in fetchProposalDetail:", err);
    return null;
  }
}

export async function fetchGovernanceTelemetry(): Promise<GovernanceTelemetry | null> {
  try {
    const res = await fetch("/api/canon/telemetry");
    if (!res.ok) throw new Error("Failed to fetch governance telemetry");
    const json = await res.json();
    return json.data || null;
  } catch (err) {
    console.warn("Error in fetchGovernanceTelemetry:", err);
    return null;
  }
}

export async function fetchCanonGraph(): Promise<CanonGraphData> {
  try {
    const res = await fetch("/api/canon/graph");
    if (!res.ok) throw new Error("Failed to fetch canon graph");
    const json = await res.json();
    return json.data || { nodes: [], links: [] };
  } catch (err) {
    console.warn("Error in fetchCanonGraph:", err);
    return { nodes: [], links: [] };
  }
}

export async function fetchHyperionEvents(limit = 50): Promise<HyperionActionItem[]> {
  try {
    const res = await fetch(`/api/canon/events?limit=${limit}`);
    if (!res.ok) throw new Error("Failed to fetch hyperion events");
    const json = await res.json();
    return json.data || [];
  } catch (err) {
    console.warn("Error in fetchHyperionEvents:", err);
    return [];
  }
}

export async function fetchPlanetaryMetrics(): Promise<PlanetaryMetric[]> {
  try {
    const res = await fetch("/api/canon/planets");
    if (!res.ok) throw new Error("Failed to fetch planetary metrics");
    const json = await res.json();
    return json.data || [];
  } catch (err) {
    console.warn("Error in fetchPlanetaryMetrics:", err);
    return [];
  }
}

export async function triggerCanonSync(): Promise<any> {
  try {
    const res = await fetch("/api/canon/sync", { method: "POST", headers: {"X-Loreworks":"1"} });
    if (!res.ok) throw new Error("Failed to trigger canon sync");
    return await res.json();
  } catch (err) {
    console.warn("Error in triggerCanonSync:", err);
    return null;
  }
}
