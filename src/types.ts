export type LoreType = 'canon' | 'proposed';
export type LoreStatus = 'active' | 'in-vote' | 'passing' | 'rejected' | 'passed' | 'draft';
export type LoreCategory = 'Planets' | 'Species' | 'Factions' | 'Technology' | 'General' | 'History';

export interface LoreEntity {
  name: string;
  type: string;
  category?: string;
}

export interface LoreRelationship {
  subject: string;
  predicate: string;
  object: string;
}

export interface LoreEvent {
  name: string;
  date?: string;
  description: string;
}

export interface LoreEntry {
  provenance?: 'community-submission' | string;
  id: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  waxAccount?: string;
  type: LoreType;
  status: LoreStatus;
  category: LoreCategory;
  tags: string[];
  entities?: LoreEntity[];
  relationships?: LoreRelationship[];
  events?: LoreEvent[];
  requiredNFT?: string;
  createdAt: any;
  voteCount: number;
  sourceUrl?: string;
  imageUrl?: string;
  proposal_id?: number;
  votes_for?: number;
  votes_against?: number;
  status_label?: string;
  planet?: string;
  primaryWorld?: string;
  mentionedWorlds?: string[];
  indexingConfidence?: 'explicit' | 'strong' | 'reference-only' | 'unassigned';
  governanceTitle?: string;
  narrativeTitle?: string;
  narrativeAuthor?: string;
  onChain?: boolean;
  contentComplete?: boolean;
  legacyIds?: string[];
  sourceHash?: string;
  chapters?: {title:string;level:number;offset:number;line:number}[];
  tx_id?: string;
  ipfs_cid?: string;
  pull_request_id?: number;
  narrative_source_status?: string;
  narrative_source_reason?: string;
  narrative_source_path?: string;
  narrative_source_sha256?: string;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  role: 'scribe' | 'skribus' | 'skiv' | 'reader';
  waxAccount?: string;
  bio?: string;
  avatarUrl?: string;
  bookmarks?: string[];
  following?: string[];
  reputation?: number;
  rank?: string;
  title?: string;
  unlockedThemes?: string[];
}

export interface ActivityLog {
  id: string;
  type: 'new_lore' | 'new_comment' | 'lore_accepted' | 'new_bounty' | 'follow' | 'bounty_claimed';
  userId: string;
  userName: string;
  waxAccount?: string;
  targetId?: string;
  targetTitle?: string;
  createdAt: any;
}

export interface Bounty {
  id: string;
  title: string;
  description: string;
  reward: string;
  category: string;
  status: 'open' | 'claimed' | 'completed';
  claimantId?: string;
  claimantName?: string;
  claimantWaxAccount?: string;
  createdAt: any;
  authorId: string;
}

export interface Comment {
  id: string;
  loreEntryId: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: any;
  status: 'pending' | 'approved' | 'rejected';
}

export interface NFTAsset {
  asset_id: string;
  name: string;
  image: string;
  collection: string;
  schema: string;
  template_id: string;
}
