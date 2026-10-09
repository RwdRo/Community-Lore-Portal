import {PAGES,openSubmission,REPO} from './services/pagesRuntime';
import {PagesAccount,PagesEditorial,PagesStorage} from './components/PagesAccount';
import {portalFetch as fetch} from './services/pagesRuntime';
import {StoryContents} from './components/StoryContents';
import AccountSecurity from './components/AccountSecurity';
import CanonExplorer from './components/CanonExplorer';
import AdventureLanding from './components/AdventureLanding';
import CorpusLibrary from './components/CorpusLibrary';
import PlayerProfile from './components/PlayerProfile';
import { AccountDialog } from './components/AccountDialog';
import { api, refreshIdentity } from './services/applicationClient';
import { AssetImage } from './components/AssetImage';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  where,
  getDoc,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  runTransaction,
  limit
} from './services/applicationClient';
import { 


  onAuthStateChanged, 
  signOut,
  User
} from './services/applicationClient';
import { db, auth } from './services/applicationClient';
import type { Session } from "@wharfkit/session";

import { motion, AnimatePresence } from 'motion/react';
import { 
  Terminal, 
  Database, 
  Vote as VoteIcon, 
  User as UserIcon, 
  Plus, 
  Search, 
  BookOpen, 
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  LogOut,
  LogIn,
  Filter,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Globe,
  Cpu,
  Map as MapIcon,
  Briefcase,
  Shield,
  Bookmark,
  X,
  Activity,
  Trophy,
  Loader2,
  Trash2,
  ExternalLink,
  Users,
  Sparkles
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { ActivityFeed } from './components/ActivityFeed';
import { BountyList } from './components/BountyList';
import { LoreContent, normalizeLoreMarkdown } from './components/LoreContent';
import { LoreGraph } from './components/LoreGraph';
import { PlanetDetail } from './components/PlanetDetail';
import { AdminDashboard } from './components/AdminDashboard';
import { SOURCE_STORIES, sourceStoryForId, sourceRecordId } from './constants/sourceArchive';
import { LORE_TAG_CATEGORIES, ALL_LORE_TAGS, getTagsFromText } from './constants/loreTags';
import { parseLoreContent } from './constants/loreParser';
import { normalizeLoreEntry } from './constants/loreIndex';
import { buildAtlasGraph } from './constants/atlasGraph';
const getUserNFTs = async (account: string) => (await import('./services/waxService')).getUserNFTs(account);
import { 
  fetchCanonProposals, 
  fetchGovernanceTelemetry, 
  transformProposalToLoreEntry,
  fetchProposalDetail,
  CanonProposal, 
  GovernanceTelemetry 
} from './services/canonService';
import {
  trackPageView,
  trackPlanetView,
  trackLoreRead,
  trackInteraction
} from './services/analyticsService';

// --- Error Handling ---

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface ApplicationErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    isAnonymous: boolean | undefined;
  }
}

const FRONTIER_PLANET_ASSETS: Record<string, string> = {
  eyeke: '/assets/iPS42_Eyeke.png',
  kavian: '/assets/iPS42_Kavian.png',
  magor: '/assets/iPS42_Magor.png',
  naron: '/assets/iPS42_Naron.png',
  neri: '/assets/iPS42_Neri.png',
  veles: '/assets/iPS42_Veles.png',
};

const getPlanetImage = (world?: string): string => {
  if (!world) return '';
  return FRONTIER_PLANET_ASSETS[world.toLowerCase().trim()] || '';
};

const LOGO_URL = '/assets/alienworlds-community-logo-color-rgb.png';

function handleApplicationError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: ApplicationErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Application Error: ', JSON.stringify(errInfo));
  return errInfo;
}

// --- Types ---

import { 
  LoreType, 
  LoreStatus, 
  LoreCategory, 
  LoreEntity, 
  LoreRelationship, 
  LoreEvent, 
  LoreEntry, 
  UserProfile, 
  ActivityLog,
  Bounty,
  Comment,
  NFTAsset
} from './types';

// --- Components ---

import { Button, Card, Badge, ConfirmationModal } from './components/UI';

// --- Main App ---

export default function App() {
  const [showAccount, setShowAccount] = useState(false);
  const [walletBusy, setWalletBusy] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [waxSession, setWaxSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [view, setView] = useState<'home' | 'database' | 'propose' | 'voting' | 'profile' | 'detail' | 'author-profile' | 'atlas' | 'inventory' | 'planet' | 'admin' | 'registry' | 'player' | 'library'>('home');
  const [playerReady, setPlayerReady] = useState(false);
  const [discoveryMessage, setDiscoveryMessage] = useState('');
  const readerReturn = useRef<any>('database');
  useEffect(() => { if (view !== 'detail') readerReturn.current = view; }, [view]);
  useEffect(() => {
    if (!user) { setPlayerReady(false); return; }
    const load = () => api('player').then(({player}) => setPlayerReady(!!player)).catch(() => setPlayerReady(false));
    api('player').then(({player}) => { setPlayerReady(!!player); if (!player) setView('player'); }).catch(() => {});
    window.addEventListener('player-updated',load);
    return () => window.removeEventListener('player-updated',load);
  }, [user?.uid]);
  const [showFilters, setShowFilters] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [communityLore, setCommunityLore] = useState<LoreEntry[]>([]);
  const [selectedLore, setSelectedLore] = useState<LoreEntry | null>(null);
  const [selectedPlanet, setSelectedPlanet] = useState<string | null>(null);
  const [expandedLoreId, setExpandedLoreId] = useState<string | null>(null);
  const [selectedAuthorProfile, setSelectedAuthorProfile] = useState<UserProfile | null>(null);
  const [userNFTs, setUserNFTs] = useState<NFTAsset[]>([]);
  const [ownedTemplateIds, setOwnedTemplateIds] = useState<Set<string>>(new Set());
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceSearchIds,setSourceSearchIds]=useState<Set<string>>(new Set());
  const [sourceSearchStatus,setSourceSearchStatus]=useState('');
  useEffect(()=>{
    const query=searchQuery.trim();setSourceSearchIds(new Set());setSourceSearchStatus('');
    if(query.length<2)return;
    const controller=new AbortController();
    const timer=setTimeout(async()=>{
      setSourceSearchStatus('Searching complete source textsâ€¦');
      try{const response=await fetch('/api/canon/proposals?query='+encodeURIComponent(query),{signal:controller.signal});if(!response.ok)throw Error('Source search unavailable.');const result=await response.json();if(!controller.signal.aborted){setSourceSearchIds(new Set(result.data.map((entry:any)=>entry.id)));setSourceSearchStatus('Full-source search complete.');}}
      catch{if(!controller.signal.aborted)setSourceSearchStatus('Full-source search is unavailable. Showing local matches.');}
    },250);
    return()=>{clearTimeout(timer);controller.abort();};
  },[searchQuery]);
  const [categoryFilter, setCategoryFilter] = useState<LoreCategory | 'All'>('All');
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<LoreType | 'All'>('All');
  const [statusFilter, setStatusFilter] = useState<LoreStatus | 'All'>('All');
  const [planetFilter, setPlanetFilter] = useState<string>('All');
  const [homeTab, setHomeTab] = useState<'all' | 'canon' | 'proposals' | 'passed'>('all');
  const [govSearchQuery, setGovSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'newest' | 'votes' | 'title'>('newest');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editProfileData, setEditProfileData] = useState({ displayName: '', bio: '' });
  const [userVotes, setUserVotes] = useState<Record<string, 'up' | 'down'>>({});
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [followedProfiles, setFollowedProfiles] = useState<UserProfile[]>([]);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean, title: string, message: string, onConfirm: () => void } | null>(null);

  // On-Chain Canon Proposals & Governance Telemetry
  const [canonProposals, setCanonProposals] = useState<CanonProposal[]>([]);
  const [governanceTelemetry, setGovernanceTelemetry] = useState<GovernanceTelemetry | null>(null);
  const [govActiveTab, setGovActiveTab] = useState<'all' | 'onchain' | 'community' | 'telemetry'>('all');
  const [govPlanetFilter, setGovPlanetFilter] = useState<string>('All');
  const [loadingFullLore, setLoadingFullLore] = useState(false);
  const [readerError,setReaderError] = useState('');
  const [readerRetry,setReaderRetry] = useState(0);

  // Seamless navigation helper to open lore reader
  const openLoreDetail = (item: LoreEntry) => {
    const resolved=sourceStoryForId(item.id)||item;
    setSelectedLore(resolved);
    setExpandedLoreId(resolved.id);
    setView('detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openRegistrySource = async (id:string) => {
    const entry=lore.find(e=>e.id===sourceRecordId(id))||sourceStoryForId(id);
    if(entry){openLoreDetail(entry);return;}
    try { const full=await api('canon/registry-source/'+encodeURIComponent(id));openLoreDetail({...full,authorId:full.authorId||'federation-archive',category:full.category||'General',tags:full.tags||[],voteCount:0,createdAt:full.createdAt||{seconds:0},contentComplete:true}); }
    catch(e:any){setConnectionError(e.message||'The source could not be opened. Please try again.');}
  };

  // Preview length is not a completeness signal. Fetch the exact selected proposal.
  useEffect(() => {
    let cancelled=false;
    setReaderError('');setLoadingFullLore(false);
    if(!selectedLore?.onChain || selectedLore.contentComplete)return;
    const requestedId=selectedLore.id,proposalId=selectedLore.proposal_id ?? requestedId;
    setLoadingFullLore(true);
    fetchProposalDetail(proposalId).then(full=>{
      if(cancelled)return;
      if(!full)throw Error('The full transmission could not be retrieved. Your preview is still available.');
      const entry=transformProposalToLoreEntry(full);
      setSelectedLore(previous=>previous?.id===requestedId?{...entry,id:requestedId}:previous);
    }).catch(error=>{if(!cancelled)setReaderError(error.message);}).finally(()=>{if(!cancelled)setLoadingFullLore(false);});
    return()=>{cancelled=true;};
  },[selectedLore?.id,selectedLore?.proposal_id,selectedLore?.contentComplete,readerRetry]);

  useEffect(() => {
    setDiscoveryMessage('');
    if (!user || !playerReady) return;
    if (view === 'detail' && !!sourceStoryForId(selectedLore?.id || '')) {
      api('player/begin', {target:selectedLore.id}).catch(e => setDiscoveryMessage(e.message));
    }
    if (view === 'planet' && selectedPlanet) {
      api('player/discover', {kind:'planet',target:selectedPlanet}).then(() => window.dispatchEvent(new Event('player-updated'))).catch(() => {});
    }
  }, [view, selectedLore?.id, selectedPlanet, user?.uid, playerReady]);
  const recordStoryDiscovery = async () => {
    if (!user) {setShowAccount(true);return;}
    if (!playerReady) {setView('player');return;}
    try {await api('player/discover',{kind:'story',target:selectedLore?.id});setDiscoveryMessage('Discovery saved to your personal codex.');window.dispatchEvent(new Event('player-updated'));}
    catch(e:any){setDiscoveryMessage(e.message);}
  };

  // Automatic Telemetry & Engagement Tracking on View / Lore / Planet changes
  useEffect(() => {
    trackPageView(view, {
      selectedPlanet: view === 'planet' ? selectedPlanet : undefined,
      selectedLoreId: view === 'detail' ? selectedLore?.id : undefined
    });

    if (view === 'planet' && selectedPlanet) {
      trackPlanetView(selectedPlanet, selectedPlanet);
    }

    if (view === 'detail' && selectedLore) {
      trackLoreRead(selectedLore.id, selectedLore.title, selectedLore.planet);
    }
  }, [view, selectedPlanet, selectedLore?.id]);

  // Polling Governance Telemetry & Canon Proposals
  useEffect(() => {
    let isMounted = true;
    const loadCanonTelemetry = async () => {
      try {
        const [props, telem] = await Promise.all([
          fetchCanonProposals(),
          fetchGovernanceTelemetry()
        ]);
        if (isMounted) {
          setCanonProposals(props);
          setGovernanceTelemetry(telem);
        }
      } catch (err) {
        console.warn("Telemetry polling warning:", err);
      }
    };

    loadCanonTelemetry();
    const interval = setInterval(loadCanonTelemetry, 25000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Loreworks server sessions own identity and privileges.
  useEffect(() => onAuthStateChanged(auth, async (u) => {
    setUser(u);
    try { setProfile(u ? (await getDoc(doc(db, 'users', u.uid))).data() as UserProfile : null); }
    catch (error: any) { setConnectionError(error.message); }
    setLoading(false);
  }), []);


  // Cancel stale account requests so assets cannot cross between signed-in users.
  useEffect(() => {
    let current=true;
    setUserNFTs([]);setOwnedTemplateIds(new Set());
    if(profile?.waxAccount) getUserNFTs(profile.waxAccount).then(nfts=>{
      if(current){setUserNFTs(nfts);setOwnedTemplateIds(new Set(nfts.map(n=>n.template_id)));}
    }).catch(()=>{});
    return()=>{current=false;};
  }, [profile?.waxAccount]);

  const handleWaxLogin = async () => {
    if (walletBusy) return;
    setWalletBusy(true); setConnectionError('');
    try {
      const {sessionKit} = await import('./services/waxService');
      const challenge = await api('auth/wallet/challenge', {});
      const result = await sessionKit.login({
        chain: challenge.chainId,
        arbitrary: {loreworksScope: challenge.scope}
      });
      if (!result.response.identityProof) throw new Error('This wallet did not return a signed identity proof. Try Anchor, or use a Loreworks account.');
      await api('auth/wallet/verify', {proof: result.response.identityProof.toString()});
      setWaxSession(result.session);
      await refreshIdentity();
    } catch (error: any) {
      setConnectionError(error.message || 'Wallet connection was not completed.');
    } finally { setWalletBusy(false); }
  };

  const handleUpdateUserRole = async (targetUid: string, newRole: UserProfile['role']) => {
    if (profile?.role !== 'scribe' || targetUid === 'federation-archive') return;
    try {
      await updateDoc(doc(db, 'users', targetUid), { role: newRole });
      if (selectedAuthorProfile && selectedAuthorProfile.uid === targetUid) {
        setSelectedAuthorProfile({ ...selectedAuthorProfile, role: newRole });
      }
      alert(`Role updated to ${newRole}`);
    } catch (error) {
      handleApplicationError(error, OperationType.UPDATE, `users/${targetUid}`);
    }
  };

  // Fetch followed profiles
  useEffect(() => {
    if (!user || !profile || !profile.following || profile.following.length === 0) {
      setFollowedProfiles([]);
      return;
    }

    const fetchFollowed = async () => {
      try {
        const q = query(collection(db, 'users'), where('uid', 'in', profile.following));
        const snapshot = await getDocs(q);
        const profiles = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
        setFollowedProfiles(profiles);
      } catch (error) {
        console.error("Error fetching followed profiles:", error);
      }
    };

    fetchFollowed();
  }, [user, profile?.following]);

  // Lore Subscription - Listen to live community storage community submissions & updates
  useEffect(() => {
    const q = query(collection(db, 'lore'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LoreEntry));
      setCommunityLore(data);
    }, (error) => {
      handleApplicationError(error, OperationType.LIST, 'lore');
      setCommunityLore([]);
    });
    return unsubscribe;
  }, [loading, profile]);

  // Unified Lore State: keep each source record distinct by its own stable ID.
  // Titles are display text and must never be used as record identity.
  const lore = useMemo<LoreEntry[]>(() => {
    const transformedProposals: LoreEntry[] = canonProposals.map(transformProposalToLoreEntry);
    const entryMap = new Map<string, LoreEntry>();
    const authoritativeSourceUrls = new Set<string>();

    for (const entry of SOURCE_STORIES) {
      const normalized = normalizeLoreEntry(entry);
      entryMap.set(normalized.id, normalized);
      if (normalized.sourceUrl) authoritativeSourceUrls.add(normalized.sourceUrl);
    }

    for (const propEntry of transformedProposals) {
      if(propEntry.narrative_source_sha256 && SOURCE_STORIES.some(source=>source.sourceHash===propEntry.narrative_source_sha256))continue;
      entryMap.set(propEntry.id, propEntry);
    }

    for (const fEntry of communityLore) {
      const normalized = normalizeLoreEntry(fEntry);
      // Older client-side README syncs wrote copies of canonical source
      // sections into community storage with new document IDs. If an exact source URL
      // is already shipped in the authoritative corpus, suppress only that
      // exact duplicate. No title-based dedupe is permitted.
      if (normalized.sourceUrl && authoritativeSourceUrls.has(normalized.sourceUrl)) continue;
      entryMap.set(normalized.id, normalized);
    }

    return Array.from(entryMap.values());
  }, [communityLore, canonProposals]);

  // Interactive Atlas graph is derived from the same normalized lore index used by the archive.
  // The visual map stays the original D3 star-map; only its data source is replaced.
  const atlasGraph = useMemo(() => buildAtlasGraph(lore), [lore]);

  // Comments Subscription
  useEffect(() => {
    if (!selectedLore) {
      setComments([]);
      return;
    }

    const q = profile?.role === 'scribe' 
      ? query(
          collection(db, 'comments'),
          where('loreEntryId', 'in', [selectedLore.id,...(selectedLore.legacyIds||[])]),
          orderBy('createdAt', 'asc')
        )
      : query(
          collection(db, 'comments'),
          where('loreEntryId', 'in', [selectedLore.id,...(selectedLore.legacyIds||[])]),
          where('status', '==', 'approved'),
          orderBy('createdAt', 'asc')
        );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Comment));
      setComments(data);
    }, (error) => {
      handleApplicationError(error, OperationType.LIST, `comments/${selectedLore.id}`);
    });

    return unsubscribe;
  }, [selectedLore]);

  const syncCanonLore = async () => {
    if (!user || profile?.role !== 'scribe') return;
    setSyncing(true);

    try {
      // Canon synchronization is now server-owned. The old client importer
      // split the current README on every H2 and could turn subsections into
      // separate stories, guess categories from body keywords, and duplicate
      // archive material in community storage. The server sync preserves WAX -> exact
      // GitHub PR provenance instead.
      const response = await fetch('/api/canon/sync', { method: 'POST', headers: {'X-Loreworks':'1'} });
      if (!response.ok) throw new Error(`Canon sync failed (${response.status})`);
      const payload = await response.json();
      if (!payload?.success) throw new Error(payload?.error || 'Canon sync failed');

      const [props, telem] = await Promise.all([
        fetchCanonProposals(),
        fetchGovernanceTelemetry()
      ]);
      setCanonProposals(props);
      setGovernanceTelemetry(telem);

      const result = payload.result || {};
      alert(`Canon sync complete: ${result.indexed_proposals ?? props.length} proposals; ${result.canon_nodes ?? 0} graph nodes; ${result.canon_edges ?? 0} graph edges.`);
    } catch (error) {
      console.error('Sync Error:', error);
      alert('Failed to sync canon sources. Check the server console for details.');
    } finally {
      setSyncing(false);
    }
  };

  const [newLore, setNewLore] = useState({ 
    title: '', 
    content: '', 
    category: 'General' as LoreCategory,
    imageUrl: '',
    sourceUrl: ''
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) {
      setUserVotes({});
      return;
    }
    const q = query(collection(db, 'votes'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const votes: Record<string, 'up' | 'down'> = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        votes[data.loreEntryId] = data.voteType;
      });
      setUserVotes(votes);
    });
    return unsubscribe;
  }, [user]);

  // Activity Subscription
  useEffect(() => {
    const q = query(collection(db, 'activity'), orderBy('createdAt', 'desc'), limit(10));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog));
      setActivities(data);
    }, (error) => {
      handleApplicationError(error, OperationType.LIST, 'activity');
    });
    return unsubscribe;
  }, []);

  // Bounties Subscription
  useEffect(() => {
    const q = query(collection(db, 'bounties'), where('status', '==', 'open'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bounty));
      setBounties(data);
    }, (error) => {
      handleApplicationError(error, OperationType.LIST, 'bounties');
    });
    return unsubscribe;
  }, []);

  const getRank = (reputation: number = 0) => {
    if (reputation >= 1000) return "Grand Archivist";
    if (reputation >= 500) return "Master Scribe";
    if (reputation >= 250) return "Senior Chronicler";
    if (reputation >= 100) return "Adept Scribe";
    if (reputation >= 50) return "Journeyman Scribe";
    return "Novice Scribe";
  };

  const handleFollow = async (targetUid: string) => {
    if (!user || !profile) return;
    
    const isFollowing = profile.following?.includes(targetUid);
    const newFollowing = isFollowing 
      ? profile.following?.filter(id => id !== targetUid) || []
      : [...(profile.following || []), targetUid];
      
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        following: newFollowing
      });
      
      // Log activity
      if (!isFollowing) {
        await addDoc(collection(db, 'activity'), {
          type: 'follow',
          userId: user.uid,
          userName: profile.displayName,
          targetId: targetUid,
          targetTitle: selectedAuthorProfile?.displayName || 'Another Explorer',
          createdAt: serverTimestamp()
        });
      }
    } catch (error) {
      handleApplicationError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const handleLoreLinkClick = (title: string) => {
    const matches = lore.filter(l => l.title.toLowerCase() === title.toLowerCase());
    if (matches.length === 1) {
      const entry = matches[0];
      setSelectedLore(entry);
      setExpandedLoreId(entry.id);
      setView('detail');
    } else if (matches.length > 1) {
      alert(`Multiple archive entries are named "${title}". Use archive search to choose the correct source.`);
    } else {
      alert(`Lore entry "${title}" not found in the archive.`);
    }
  };

  const handleClaimBounty = async (bountyId: string) => {
    if (!user || !profile) return;
    
    try {
      await updateDoc(doc(db, 'bounties', bountyId), {
        status: 'claimed',
        claimantId: user.uid,
        claimantName: profile.displayName,
        claimantWaxAccount: profile.waxAccount || null,
        claimedAt: serverTimestamp()
      });
      
      await addDoc(collection(db, 'activity'), {
        type: 'bounty_claimed',
        userId: user.uid,
        userName: profile.displayName,
        waxAccount: profile.waxAccount || null,
        targetId: bountyId,
        targetTitle: bounties.find(b => b.id === bountyId)?.title || 'Unknown Bounty',
        createdAt: serverTimestamp()
      });
    } catch (error) {
      handleApplicationError(error, OperationType.UPDATE, `bounties/${bountyId}`);
    }
  };

  const handleDeleteLore = (loreId: string) => {
    if (!user || profile?.role !== 'scribe') return;
    setConfirmModal({
      isOpen: true,
      title: "Delete Transmission",
      message: "Are you sure you want to delete this lore entry? This action cannot be undone.",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'lore', loreId));
          setView('database');
          setSelectedLore(null);
          setConfirmModal(null);
        } catch (error) {
          handleApplicationError(error, OperationType.DELETE, `lore/${loreId}`);
        }
      }
    });
  };

  const handleDeleteComment = (commentId: string) => {
    if (!user || profile?.role !== 'scribe') return;
    setConfirmModal({
      isOpen: true,
      title: "Purge Comment",
      message: "Are you sure you want to delete this comment from the thread?",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'comments', commentId));
          setConfirmModal(null);
        } catch (error) {
          handleApplicationError(error, OperationType.DELETE, `comments/${commentId}`);
        }
      }
    });
  };

  const handlePropose = async () => {
    if(PAGES){if(!newLore.title||!newLore.content)return;openSubmission('[Lore] '+newLore.title,newLore.content+'\n\nSource: '+(newLore.sourceUrl||'Not specified')+'\nWAX identity (self-reported): '+(profile?.waxAccount||'Not supplied'));return;}
    if (!user || !newLore.title || !newLore.content) return;
    setSubmitting(true);
    try {
      const parsed = parseLoreContent(newLore.content);
      const loreRef = await addDoc(collection(db, 'lore'), {
        ...newLore,
        authorId: user.uid,
        authorName: profile?.displayName || 'Unknown Explorer',
        waxAccount: profile?.waxAccount || null,
        type: 'proposed',
        status: 'in-vote',
        tags: parsed.tags,
        entities: parsed.entities,
        relationships: parsed.relationships,
        events: parsed.events,
        createdAt: serverTimestamp(),
        voteCount: 0
      });

      // Log Activity
      await addDoc(collection(db, 'activity'), {
        type: 'new_lore',
        userId: user.uid,
        userName: profile?.displayName || 'Unknown Explorer',
        waxAccount: profile?.waxAccount || null,
        targetId: loreRef.id,
        targetTitle: newLore.title,
        createdAt: serverTimestamp()
      });

      setNewLore({ 
        title: '', 
        content: '', 
        category: 'General',
        imageUrl: '',
        sourceUrl: ''
      });
      setView('database');
    } catch (error) {
      handleApplicationError(error, OperationType.CREATE, 'lore');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBookmark = async (loreId: string) => {
    if (!user || !profile) return;
    const currentBookmarks = profile.bookmarks || [];
    const isBookmarked = currentBookmarks.some(id=>sourceRecordId(id)===loreId);
    const newBookmarks = isBookmarked 
      ? currentBookmarks.filter(id => sourceRecordId(id) !== loreId)
      : [...currentBookmarks, loreId];

    try {
      await setDoc(doc(db, 'users', user.uid), {
        ...profile,
        bookmarks: newBookmarks
      });
      setProfile({ ...profile, bookmarks: newBookmarks });
    } catch (error) {
      handleApplicationError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const viewAuthorProfile = async (authorId: string) => {
    if (authorId === 'federation-archive') {
      // Special case for canon lore
      setSelectedAuthorProfile({
        uid: 'federation-archive',
        displayName: 'Federation Archive',
        role: 'scribe',
        bio: 'The official repository of the Alien Worlds Federation. Contains all verified canon lore.'
      });
      setView('author-profile');
      return;
    }

    try {
      const userDoc = await getDoc(doc(db, 'users', authorId));
      if (userDoc.exists()) {
        setSelectedAuthorProfile({ uid: authorId, ...userDoc.data() } as UserProfile);
        setView('author-profile');
      } else if (authorId.match(/^[a-z1-5.]{6,12}$/)) {
        // It's a WAX account but no profile in our DB yet
        setSelectedAuthorProfile({
          uid: authorId,
          displayName: authorId,
          waxAccount: authorId,
          role: 'reader',
          bio: `WAX Author: ${authorId}. This user has not yet initialized their terminal profile.`
        });
        setView('author-profile');
      }
    } catch (error) {
      handleApplicationError(error, OperationType.GET, `users/${authorId}`);
    }
  };



  const handleVote = async (loreId: string, type: 'up' | 'down') => {
    if(PAGES){openSubmission('[Discussion] '+loreId,'Archive entry: '+loreId+'\n\nFeedback: ');return;}
    if (!user) { setShowAccount(true); return; }
    try { await api('app/vote', {loreId,type}); window.dispatchEvent(new Event('loreworks-data')); }
    catch(error: any) { setConnectionError(error.message); }
  };

  const handleComment = async (e: React.FormEvent) => {
    if(PAGES){e.preventDefault();openSubmission('[Discussion] '+(selectedLore?.title||'Lore'),newComment+'\n\nArchive ID: '+selectedLore?.id);return;}
    e.preventDefault();
    if (!user || !selectedLore || !newComment.trim()) return;

    try {
      const commentRef = await addDoc(collection(db, 'comments'), {
        loreEntryId: selectedLore.id,
        userId: user.uid,
        userName: profile?.displayName || 'Unknown Explorer',
        text: newComment.trim(),
        createdAt: serverTimestamp(),
        status: profile?.role === 'scribe' ? 'approved' : 'pending'
      });

      // Log Activity
      await addDoc(collection(db, 'activity'), {
        type: 'new_comment',
        userId: user.uid,
        userName: profile?.displayName || 'Unknown Explorer',
        targetId: selectedLore.id,
        targetTitle: selectedLore.title,
        createdAt: serverTimestamp()
      });

      setNewComment('');
    } catch (error) {
      handleApplicationError(error, OperationType.CREATE, 'comments');
    }
  };

  const handleAcceptLore = async (loreId: string) => {
    if (!user || profile?.role !== 'scribe') return;
    const loreRef = doc(db, 'lore', loreId);
    const loreEntry = lore.find(l => l.id === loreId);
    if (!loreEntry) return;

    try {
      await runTransaction(db, async (transaction) => {
        transaction.update(loreRef, {
          type: 'proposed',
          status: 'active'
        });

        // Log Activity
        const activityRef = doc(collection(db, 'activity'));
        transaction.set(activityRef, {
          type: 'lore_accepted',
          userId: user.uid,
          userName: profile?.displayName || 'The Federation',
          targetId: loreId,
          targetTitle: loreEntry.title,
          createdAt: serverTimestamp()
        });

        // Reward Reputation
        const authorRef = doc(db, 'users', loreEntry.authorId);
        const authorDoc = await transaction.get(authorRef);
        if (authorDoc.exists()) {
          const currentRep = authorDoc.data().reputation || 0;
          transaction.update(authorRef, { reputation: currentRep + 100 });
        }
      });
      alert("Community submission approved. This does not establish on-chain canon.");
    } catch (error) {
      handleApplicationError(error, OperationType.WRITE, `lore/${loreId}`);
    }
  };

  const handleLogin = () => setShowAccount(true);
  const handleLogout = async () => {
    await signOut(auth);
    if (waxSession) { try { await (await import('./services/waxService')).sessionKit.logout(waxSession); } catch { /* Server session is already revoked. */ } }
    setWaxSession(null); setProfile(null); setUserNFTs([]); setOwnedTemplateIds(new Set());
  };

  const handleUpdateProfile = async () => {
    if (!user || !profile) return;
    try {
      const updatedProfile = {
        ...profile,
        displayName: editProfileData.displayName,
        bio: editProfileData.bio
      };
      await setDoc(doc(db, 'users', user.uid), updatedProfile);
      setProfile(updatedProfile);
      setIsEditingProfile(false);
    } catch (error) {
      handleApplicationError(error, OperationType.WRITE, `users/${user.uid}`);
    }
  };

  const filteredLore = useMemo(() => {
    return lore
      .filter(item => {
        const queryLower = searchQuery.toLowerCase().trim();
        const matchesSearch = !queryLower || sourceSearchIds.has(item.id) || 
                             item.title.toLowerCase().includes(queryLower) || 
                             item.content.toLowerCase().includes(queryLower) ||
                             item.chapters?.some(chapter=>chapter.title.toLowerCase().includes(queryLower)) ||
                             item.authorName.toLowerCase().includes(queryLower) ||
                             (item.waxAccount && item.waxAccount.toLowerCase().includes(queryLower)) ||
                             item.tags.some(t => t.toLowerCase().includes(queryLower)) ||
                             (item.entities && item.entities.some(e => e.name.toLowerCase().includes(queryLower))) ||
                             (item.proposal_id && `proposal #${item.proposal_id}`.toLowerCase().includes(queryLower));

        const matchesCategory = categoryFilter === 'All' || item.category === categoryFilter;
        const matchesTags = tagFilters.length === 0 || tagFilters.every(tag => item.tags.includes(tag));
        const matchesType = typeFilter === 'All' || item.type === typeFilter;
        const matchesStatus = statusFilter === 'All' || item.status === statusFilter;
        const matchesPlanet = planetFilter === 'All' ||
                              item.primaryWorld?.toLowerCase() === planetFilter.toLowerCase();

        return matchesSearch && matchesCategory && matchesTags && matchesType && matchesStatus && matchesPlanet;
      })
      .sort((a, b) => {
        if (sortBy === 'newest') return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
        if (sortBy === 'votes') return (b.voteCount || 0) - (a.voteCount || 0);
        if (sortBy === 'title') return a.title.localeCompare(b.title);
        return 0;
      });
  }, [lore, searchQuery, sourceSearchIds, categoryFilter, tagFilters, typeFilter, statusFilter, planetFilter, sortBy]);

  const categories: LoreCategory[] = ['Planets', 'Species', 'Factions', 'Technology', 'General', 'History'];

  const sortedNFTs = [...userNFTs].sort((a, b) => {
    const aIsLore = a.collection.includes('art.worlds') || a.collection.includes('lore.worlds');
    const bIsLore = b.collection.includes('art.worlds') || b.collection.includes('lore.worlds');
    if (aIsLore && !bIsLore) return -1;
    if (!aIsLore && bIsLore) return 1;
    return 0;
  });

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-black">
        <div className="text-white animate-pulse tracking-[0.5em] uppercase">Initializing Terminal...</div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col crt-overlay relative overflow-hidden bg-[#050505]">
      <div className="absolute inset-0 astral-field opacity-40 pointer-events-none" />
      <div className="scanline" />
      
      {showAccount && (PAGES ? <PagesAccount onClose={()=>setShowAccount(false)}/> : <AccountDialog onClose={() => setShowAccount(false)} />)}
      {connectionError && <div role="alert" className="relative z-[110] bg-neutral-black border border-error-default/40 p-3 text-sm flex justify-between gap-3"><span>{connectionError}</span><button onClick={() => setConnectionError('')} aria-label="Dismiss connection error">Ã—</button></div>}
      {walletBusy && <div role="status" className="relative z-[110] bg-neutral-black p-2 text-xs text-gold-default">Waiting for your walletâ€¦</div>}
      {/* --- Top Bar --- */}
      <header className="h-16 border-b border-neutral-grey/10 flex items-center justify-between px-6 z-50 bg-neutral-black/80 backdrop-blur-md">
        <div className="flex items-center gap-4 cursor-pointer" onClick={() => setView('home')}>
          <div className="w-12 h-12 flex items-center justify-center relative">
            <div className="absolute inset-0 bg-gold-default/10 rounded-full blur-lg animate-pulse" />
            <img src={LOGO_URL} alt="Alien Worlds Community" className="w-full h-full object-contain relative z-10 drop-shadow-[0_0_8px_rgba(251,191,36,0.4)]" referrerPolicy="no-referrer" />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-lg font-bold tracking-tighter text-gold-default terminal-text-glow leading-none uppercase italic">Lore Portal</h1>
            <p className="text-[10px] text-neutral-grey uppercase tracking-[0.2em]">Federation Archive</p>
          </div>
        </div>

        <nav className="hidden xl:flex items-center gap-5">
          {[
            { id: 'database', label: 'Database', icon: Database },
            { id: 'atlas', label: 'Atlas', icon: MapIcon },
            { id: 'registry', label: 'Lore Codex', icon: BookOpen },
            { id: 'player', label: 'Play', icon: UserIcon },
            { id: 'voting', label: 'Governance', icon: VoteIcon },
            { id: 'propose', label: 'Scribe Portal', icon: Plus },
            { id: 'inventory', label: 'Inventory', icon: Briefcase },
            { id: 'admin', label: 'Admin', icon: Shield },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setView(item.id as any)}
              className={`flex items-center gap-2 text-xs uppercase tracking-widest transition-all pb-1 border-b-2 ${view === item.id ? 'text-gold-default border-gold-default' : 'text-neutral-grey border-transparent hover:text-neutral-white'}`}
            >
              <item.icon size={14} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="xl:hidden flex-1 px-3">
          <label className="sr-only" htmlFor="mobile-primary-nav">Primary navigation</label>
          <select
            id="mobile-primary-nav"
            value={['database', 'atlas', 'registry', 'player', 'voting', 'propose', 'inventory', 'admin', 'library'].includes(view) ? view : 'database'}
            onChange={(event) => setView(event.target.value as any)}
            className="w-full max-w-[170px] bg-neutral-black/70 border border-neutral-grey/20 px-2 py-2 text-[10px] uppercase tracking-widest text-neutral-white focus:outline-none focus:border-gold-default/50"
          >
            <option value="database">Database</option>
            <option value="atlas">Atlas</option>
            <option value="registry">Lore Codex</option><option value="library">Source Library</option>
            <option value="player">Play Â· Expeditions</option>
            <option value="voting">Governance</option>
            <option value="propose">Scribe Portal</option>
            <option value="inventory">Inventory</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <div className="flex items-center gap-4">
          {user ? (
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-neutral-white">{profile?.displayName}</p>
                <div className="flex items-center gap-2 justify-end">
                  {profile?.waxAccount ? (
                    <span className="text-[9px] text-blue-default font-mono uppercase">{profile.waxAccount}</span>
                  ) : (
                    <button 
                      onClick={handleWaxLogin}
                      className="text-[9px] text-gold-default hover:text-gold-hover uppercase tracking-widest font-bold flex items-center gap-1"
                    >
                      <Globe size={10} />
                      Connect WAX
                    </button>
                  )}
                  <Badge color={profile?.role === 'scribe' ? 'gold' : profile?.role === 'skribus' ? 'white' : 'blue'}>
                    {profile?.role}
                  </Badge>
                </div>
              </div>
              <button 
                aria-label="Account profile"
                onClick={() => setView('profile')}
                className={`w-8 h-8 rounded-full border overflow-hidden bg-gold-default/5 transition-all ${view === 'profile' ? 'border-gold-default' : 'border-neutral-grey/20 hover:border-gold-default/50'}`}
              >
                {user.photoURL ? (
                  <img src={user.photoURL} alt="Avatar" referrerPolicy="no-referrer" />
                ) : (
                  <UserIcon size={16} className="m-auto mt-1.5 text-gold-default" />
                )}
              </button>
              <button aria-label="Sign out" onClick={handleLogout} className="text-neutral-grey hover:text-error-default transition-colors">
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Button 
                onClick={handleWaxLogin} 
                variant="primary" 
                className="h-9 px-4 text-xs bg-blue-default hover:bg-blue-hover border-blue-default/50 shadow-[0_0_15px_rgba(0,149,255,0.3)]"
              >
                <Globe size={16} />
                WAX Wallet
              </Button>
              <Button onClick={handleLogin} variant="outline" className="h-9 px-4 text-xs border-neutral-grey/20">
                <LogIn size={16} />
                Connect
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* --- Main Content --- */}
      <main className="flex-1 overflow-y-auto p-6 relative z-10">
        <AnimatePresence mode="wait">
          {view === 'library' && <CorpusLibrary user={profile}/> }
          {view === 'registry' && <motion.div key="registry" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}><div className="flex justify-end mb-4"><Button variant="outline" onClick={()=>setView('library')}>Search every passage Â· Source Library â†’</Button></div><CanonExplorer user={profile} onLogin={handleLogin} onRead={openRegistrySource} /></motion.div>}
          {view === 'player' && <motion.div key="player" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}><PlayerProfile user={profile} onLogin={handleLogin} onExplore={()=>setView('registry')} onRead={openRegistrySource} /></motion.div>}
          {view === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-6xl mx-auto space-y-8"
            >
              <AdventureLanding user={profile} onLogin={handleLogin} onPlay={()=>setView('player')} onExplore={()=>setView('registry')} onRead={openRegistrySource}/>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                  <section>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                      <div>
                        <h2 className="text-2xl font-bold tracking-tighter uppercase italic text-gold-default">Archive Transmissions</h2>
                        <p className="text-[10px] text-neutral-grey uppercase tracking-widest">Unified stream of canon, on-chain governance, and community lore</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex bg-neutral-black/60 border border-neutral-grey/15 rounded p-1">
                          <button
                            onClick={() => setHomeTab('all')}
                            className={`px-2.5 py-1 rounded text-[9px] uppercase tracking-widest font-bold transition-all ${homeTab === 'all' ? 'bg-gold-default text-black' : 'text-neutral-grey hover:text-white'}`}
                          >
                            All ({lore.length})
                          </button>
                          <button
                            onClick={() => setHomeTab('canon')}
                            className={`px-2.5 py-1 rounded text-[9px] uppercase tracking-widest font-bold transition-all ${homeTab === 'canon' ? 'bg-gold-default text-black' : 'text-neutral-grey hover:text-white'}`}
                          >
                            Canon ({lore.filter(l => l.type === 'canon').length})
                          </button>
                          <button
                            onClick={() => setHomeTab('proposals')}
                            className={`px-2.5 py-1 rounded text-[9px] uppercase tracking-widest font-bold transition-all ${homeTab === 'proposals' ? 'bg-blue-500 text-white' : 'text-neutral-grey hover:text-white'}`}
                          >
                            Proposals ({lore.filter(l => l.onChain || l.type === 'proposed').length})
                          </button>
                          <button
                            onClick={() => setHomeTab('passed')}
                            className={`px-2.5 py-1 rounded text-[9px] uppercase tracking-widest font-bold transition-all ${homeTab === 'passed' ? 'bg-emerald-500 text-black' : 'text-neutral-grey hover:text-white'}`}
                          >
                            Passed ({lore.filter(l => l.status_label === 'passed' || (l.onChain && l.status === 'active')).length})
                          </button>
                        </div>
                        <Button onClick={() => setView('database')} variant="ghost" className="text-[10px]">View Database â†’</Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {lore
                        .filter(item => {
                          if (homeTab === 'canon') return item.type === 'canon';
                          if (homeTab === 'proposals') return item.onChain || item.type === 'proposed';
                          if (homeTab === 'passed') return item.status_label === 'passed' || (item.onChain && item.status === 'active');
                          return true;
                        })
                        .slice(0, 6)
                        .map(item => {
                          const isGated = item.requiredNFT && !ownedTemplateIds.has(item.requiredNFT);
                          const totalVotes = (item.votes_for || 0) + (item.votes_against || 0);
                          const forPercentage = totalVotes > 0 ? Math.round(((item.votes_for || 0) / totalVotes) * 100) : 0;
                          return (
                            <motion.div
                              key={item.id}
                              whileHover={{ y: -2 }}
                              transition={{ duration: 0.15 }}
                            >
                              <Card 
                                title={item.category} 
                                className="h-full hover:border-gold-default/40 cursor-pointer group flex flex-col justify-between"
                                onClick={() => openLoreDetail(item)}
                              >
                                <div>
                                  <div className="flex justify-between items-start mb-3">
                                    <div>
                                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                        {item.onChain && (
                                          <Badge color="blue">
                                            Proposal #{item.proposal_id || item.id}
                                          </Badge>
                                        )}
                                        {item.planet && (
                                          <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 uppercase">
                                            {item.planet}
                                          </span>
                                        )}
                                        {item.status_label && (
                                          <span className={`text-[8px] uppercase font-mono font-bold px-1.5 py-0.5 rounded ${
                                            item.status_label === 'passed' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-blue-500/20 text-blue-300'
                                          }`}>
                                            {item.status_label}
                                          </span>
                                        )}
                                      </div>
                                      <h4 className="font-bold tracking-tighter uppercase italic leading-tight text-lg group-hover:text-gold-default transition-colors">
                                        {item.title}
                                      </h4>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {item.requiredNFT && (
                                        <Badge color="blue">
                                          <Shield size={10} className="mr-1" />
                                          Gated
                                        </Badge>
                                      )}
                                      <Badge color={item.type === 'canon' ? 'white' : 'gold'}>{item.provenance === 'community-submission' && item.status === 'active' ? 'Community approved' : item.type}</Badge>
                                    </div>
                                  </div>

                                  {isGated ? (
                                    <div className="flex flex-col items-center justify-center py-6 text-center bg-neutral-black/40 rounded border border-dashed border-neutral-grey/20 mb-3">
                                      <Shield size={20} className="text-neutral-grey/40 mb-1" />
                                      <p className="text-[10px] uppercase tracking-widest text-neutral-grey">Restricted Archive</p>
                                      <p className="text-[8px] text-neutral-grey/60 mt-0.5">Requires NFT Template: {item.requiredNFT}</p>
                                    </div>
                                  ) : (
                                    <p className="text-xs text-neutral-grey line-clamp-3 mb-3 leading-relaxed">
                                      {normalizeLoreMarkdown(item.content).replace(/[#*`]/g, '')}
                                    </p>
                                  )}

                                  {/* Auto-extracted tags list */}
                                  {item.tags && item.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mb-3">
                                      {item.tags.slice(0, 3).map(tag => (
                                        <span
                                          key={tag}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setTagFilters([tag]);
                                            setShowFilters(true);
                                            setView('database');
                                            window.scrollTo({ top: 0, behavior: 'smooth' });
                                          }}
                                          className="text-[9px] px-1.5 py-0.5 bg-neutral-black/60 border border-neutral-grey/15 text-neutral-grey hover:text-gold-default hover:border-gold-default/40 transition-all uppercase tracking-widest"
                                        >
                                          #{tag}
                                        </span>
                                      ))}
                                      {item.tags.length > 3 && (
                                        <span className="text-[9px] text-neutral-grey/60 px-1 py-0.5 font-mono">
                                          +{item.tags.length - 3}
                                        </span>
                                      )}
                                    </div>
                                  )}

                                  {/* Quorum / Votes Meter if on-chain or community proposal */}
                                  {(item.onChain || item.votes_for !== undefined) && totalVotes > 0 && (
                                    <div className="my-2 p-2 bg-neutral-white/[0.02] border border-neutral-grey/10 rounded">
                                      <div className="flex justify-between text-[9px] font-mono text-neutral-grey mb-1">
                                        <span className="text-emerald-400">FOR: {item.votes_for || 0}</span>
                                        <span className="text-gold-default">{forPercentage}% Quorum</span>
                                        <span className="text-rose-400">AGAINST: {item.votes_against || 0}</span>
                                      </div>
                                      <div className="w-full bg-neutral-grey/20 h-1 rounded-full overflow-hidden flex">
                                        <div className="bg-emerald-400 h-full" style={{ width: `${forPercentage}%` }} />
                                        <div className="bg-rose-500 h-full" style={{ width: `${100 - forPercentage}%` }} />
                                      </div>
                                    </div>
                                  )}
                                </div>

                                <div className="mt-auto">
                                  <div className="flex items-center justify-between text-[10px] text-neutral-grey uppercase tracking-widest mb-3 pt-2 border-t border-neutral-grey/5">
                                    <div className="flex items-center gap-3">
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); viewAuthorProfile(item.authorId); }}
                                        className="text-blue-default hover:text-blue-hover transition-colors flex flex-col items-start"
                                      >
                                        <span className="font-bold flex items-center gap-1">
                                          <UserIcon size={10} />
                                          {item.authorName}
                                        </span>
                                        {item.waxAccount && (
                                          <div className="flex items-center gap-1 mt-0.5">
                                            <div className="w-1 h-1 rounded-full bg-blue-default animate-pulse" />
                                            <span className="text-[8px] text-blue-default font-mono uppercase tracking-tighter bg-blue-default/10 px-1 rounded">
                                              {item.waxAccount}
                                            </span>
                                          </div>
                                        )}
                                      </button>
                                      <span className="flex items-center gap-1">
                                        <ThumbsUp size={10} className={item.voteCount > 0 ? 'text-success-default' : ''} />
                                        <span className={item.voteCount !== 0 ? (item.voteCount > 0 ? 'text-success-default' : 'text-error-default') : ''}>
                                          {item.voteCount || 0}
                                        </span>
                                      </span>
                                    </div>
                                    <span>{item.sourceHash ? 'Pinned source edition' : new Date(item.createdAt?.seconds * 1000).toLocaleDateString()}</span>
                                  </div>
                                  <Button 
                                    variant="outline" 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openLoreDetail(item);
                                    }}
                                    className="w-full justify-center text-[10px] h-8 group-hover:border-gold-default/40 group-hover:text-gold-default"
                                  >
                                    Read Transmission <ChevronRight size={12} className="ml-1" />
                                  </Button>
                                </div>
                              </Card>
                            </motion.div>
                          );
                        })}
                    </div>
                  </section>
                </div>

                  <aside className="space-y-6">
                    <ActivityFeed activities={activities} />
                    <BountyList 
                      bounties={bounties} 
                      onClaim={handleClaimBounty} 
                      currentUserId={user?.uid} 
                    />
                    
                    <Card title="System Telemetry">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] uppercase text-neutral-grey">WAX Consensus</span>
                        <span className="text-[10px] uppercase text-emerald-400 font-mono flex items-center gap-1 font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          {governanceTelemetry?.status || 'Active'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] uppercase text-neutral-grey">Canon Lore Contract</span>
                        <span className="text-[10px] uppercase font-mono text-blue-400">{governanceTelemetry?.contract || 'lore.worlds'}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] uppercase text-neutral-grey">Consensus Pass Rate</span>
                        <span className="text-[10px] uppercase font-mono text-gold-default font-bold">{governanceTelemetry?.pass_rate_pct ?? 0}%</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] uppercase text-neutral-grey">Archived Lore</span>
                        <span className="text-[10px] uppercase font-mono text-neutral-white">{lore.length} Entries</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] uppercase text-neutral-grey">Active Governance</span>
                        <span className="text-[10px] uppercase font-mono text-amber-300">
                          {(canonProposals.filter(p => p.status === 1 || p.status_label === 'active').length) + (lore.filter(l => l.status === 'in-vote').length)} Live
                        </span>
                      </div>
                    </div>
                  </Card>

                  <Card title="Canon Contributors">
                    <div className="space-y-3">
                      {Array.from(new Set(lore.filter(l => l.type === 'canon').map(l => l.authorName))).slice(0, 10).map(author => (
                        <div key={author} className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full bg-neutral-white/10 flex items-center justify-center text-[10px] font-bold border border-neutral-grey/10">
                            {author[0]}
                          </div>
                          <span className="text-xs text-neutral-white">{author}</span>
                        </div>
                      ))}
                      {lore.filter(l => l.type === 'canon').length === 0 && (
                        <p className="text-[10px] text-neutral-grey uppercase tracking-widest italic">No contributors yet</p>
                      )}
                    </div>
                  </Card>

                  <Card title="Community Scribe">
                    <p className="text-xs text-neutral-grey mb-4 italic">"The metaverse is built on stories. Your contribution shapes the future of the Alien Worlds IP."</p>
                    <Button onClick={() => setView('propose')} className="w-full justify-center">
                      <Plus size={16} />
                      <span className="text-xs font-bold uppercase">Submit Proposal</span>
                    </Button>
                  </Card>
                </aside>
              </div>

              {/* --- Map View --- */}
              <motion.div
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                className="mt-12"
              >
                <Card title="Planetary Grid Overview">
                  <div className="grid grid-cols-4 sm:grid-cols-8 md:grid-cols-12 gap-2 h-64">
                    {Array.from({ length: 96 }).map((_, i) => {
                      const planetMap: Record<number, { name: string; label: string }> = {
                        12: { name: 'eyeke', label: 'Eyeke' },
                        25: { name: 'kavian', label: 'Kavian' },
                        42: { name: 'magor', label: 'Magor' },
                        67: { name: 'neri', label: 'Neri' },
                        81: { name: 'veles', label: 'Veles' },
                        90: { name: 'naron', label: 'Naron' }
                      };
                      const planet = planetMap[i];
                      return (
                        <div 
                          key={i} 
                          onClick={() => {
                            if (planet) {
                              setSelectedPlanet(planet.name);
                              setView('planet');
                            }
                          }}
                          className={`border border-neutral-grey/5 flex flex-col items-center justify-center transition-all ${planet ? 'bg-gold-default/15 border-gold-default/40 hover:bg-gold-default/30 cursor-pointer shadow-[0_0_10px_rgba(251,191,36,0.2)]' : 'hover:bg-neutral-white/5'}`}
                          title={planet ? `Sector Telemetry: Planet ${planet.label}` : `Sector #${i + 1}`}
                        >
                          {planet && (
                            <>
                              <Globe size={12} className="text-gold-default mb-0.5 animate-pulse" />
                              <span className="text-[7px] uppercase font-bold text-gold-default tracking-tighter">{planet.label}</span>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 flex items-center justify-between text-[10px] uppercase text-neutral-grey">
                    <span>Sector: Federation Quadrant 1</span>
                    <span>Grid: 6 Frontier Worlds Active</span>
                    <span className="text-gold-default font-bold cursor-pointer hover:underline" onClick={() => setView('atlas')}>Explore Interactive Lore Atlas â†’</span>
                  </div>
                </Card>
              </motion.div>
            </motion.div>
          )}

          {view === 'atlas' && (
            <motion.div
              key="atlas"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="max-w-6xl mx-auto h-full flex flex-col"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-3xl font-bold tracking-tighter uppercase italic text-gold-default terminal-text-glow">Lore Atlas</h2>
                  <p className="text-xs text-neutral-grey uppercase tracking-widest">Interactive Orbital Archive Projection</p>
                </div>
                <Button onClick={() => setView('database')} variant="outline" className="text-[10px]">Back to Database</Button>
              </div>
              <LoreGraph
                entities={atlasGraph.entities}
                relationships={atlasGraph.relationships}
                onNodeClick={(nodeId, nodeType) => {
                  if (nodeType === 'planets') {
                    setSelectedPlanet(nodeId);
                    setView('planet');
                    return;
                  }

                  // Non-world nodes are archive pivots: clicking one jumps to the
                  // database with an exact search instead of pretending it is a planet.
                  setSearchQuery(nodeId);
                  if (nodeType === 'species') setCategoryFilter('Species');
                  else if (nodeType === 'factions') setCategoryFilter('Factions');
                  else if (nodeType === 'technology') setCategoryFilter('Technology');
                  else setCategoryFilter('All');
                  setView('database');
                }}
              />
            </motion.div>
          )}

          {view === 'planet' && selectedPlanet && (
            <PlanetDetail 
              planetName={selectedPlanet} 
              lore={lore} 
              onBack={() => setView('atlas')} 
              onLoreClick={(entry) => openLoreDetail(entry)}
            />
          )}

          {view === 'inventory' && (
            <motion.div
              key="inventory"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-4xl mx-auto space-y-8"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-3xl font-bold tracking-tighter uppercase italic text-gold-default terminal-text-glow">Personal Inventory</h2>
                  <p className="text-xs text-neutral-grey uppercase tracking-widest">WAX Assets & Archive Access Keys</p>
                </div>
                <Button onClick={() => setView('home')} variant="outline" className="text-[10px]">Back to Home</Button>
              </div>

              {!profile?.waxAccount ? (
                <Card className="text-center py-12">
                  <Globe size={48} className="mx-auto mb-4 text-neutral-grey/20" />
                  <h3 className="text-xl font-bold uppercase italic mb-2">WAX Wallet Not Connected</h3>
                  <p className="text-sm text-neutral-grey mb-6">Connect your WAX wallet to view your Alien Worlds assets and unlock restricted lore.</p>
                  <Button onClick={handleWaxLogin} variant="primary" className="mx-auto">Connect WAX</Button>
                </Card>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {sortedNFTs.length > 0 ? (
                    sortedNFTs.map(nft => {
                      const isLoreNFT = nft.collection.includes('art.worlds') || nft.collection.includes('lore.worlds');
                      return (
                        <Card key={nft.asset_id} className={`p-2 border-neutral-grey/10 hover:border-gold-default/40 transition-all group ${isLoreNFT ? 'ring-1 ring-gold-default/20' : ''}`}>
                          <div className="aspect-square bg-neutral-black/40 rounded overflow-hidden mb-2 relative">
                            <AssetImage reference={nft.image} name={nft.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                            <div className="absolute inset-0 bg-gradient-to-t from-neutral-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                              <span className="text-[8px] text-gold-default font-mono uppercase">ID: {nft.asset_id}</span>
                            </div>
                            {isLoreNFT && (
                              <div className="absolute top-1 right-1">
                                <Badge color="gold" className="text-[6px] px-1 py-0">Lore Key</Badge>
                              </div>
                            )}
                          </div>
                          <p className="text-[10px] font-bold uppercase truncate text-neutral-white">{nft.name}</p>
                          <p className="text-[8px] text-neutral-grey uppercase tracking-tighter">Template: {nft.template_id}</p>
                        </Card>
                      );
                    })
                  ) : (
                    <div className="col-span-full py-12 text-center border border-dashed border-neutral-grey/20 rounded-lg">
                      <p className="text-sm text-neutral-grey uppercase tracking-widest">No Alien Worlds Assets Detected</p>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {view === 'database' && (
            <motion.div
              key="database"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-6xl mx-auto"
            >
              <div className="flex flex-col md:flex-row gap-4 mb-4 items-center">
                <div className="relative flex-1 w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-grey" size={18} />
                  <input
                    type="text"
                    placeholder="SEARCH LORE ARCHIVE, ON-CHAIN PROPOSALS, TAGS, SECTORS..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-neutral-black/40 border border-neutral-grey/20 py-3 pl-10 pr-4 text-sm focus:outline-none focus:border-gold-default/40 transition-all uppercase tracking-widest text-neutral-white"
                  />
                </div>
                
                <div className="flex gap-2 w-full md:w-auto">
                    <Button 
                      variant={showFilters ? 'primary' : 'outline'} 
                      onClick={() => setShowFilters(!showFilters)}
                      className="flex-1 md:flex-none justify-center gap-2"
                    >
                      <Filter size={16} />
                      <span className="text-xs font-bold uppercase">Filters</span>
                      {(categoryFilter !== 'All' || tagFilters.length > 0 || typeFilter !== 'All' || planetFilter !== 'All' || statusFilter !== 'All') && (
                        <span className="ml-1 w-2 h-2 rounded-full bg-neutral-white animate-pulse" />
                      )}
                    </Button>
                  
                  <div className="relative flex-1 md:w-40">
                    <select 
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                      className="w-full bg-neutral-black/40 border border-neutral-grey/20 p-3 text-[10px] focus:outline-none focus:border-gold-default/40 uppercase tracking-widest text-neutral-white appearance-none h-full"
                    >
                      <option value="newest" className="bg-neutral-black">Newest</option>
                      <option value="votes" className="bg-neutral-black">Most Voted</option>
                      <option value="title" className="bg-neutral-black">Title A-Z</option>
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-grey">
                      <ChevronDown size={14} />
                    </div>
                  </div>
                </div>
              </div>

              {sourceSearchStatus && <p role="status" className="text-xs text-neutral-grey mb-3">{sourceSearchStatus}</p>}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-5 p-4 border border-blue-default/25 bg-blue-default/5"><div><p className="text-blue-default text-sm">Browse the universe by subject</p><p className="text-neutral-grey text-xs mt-1">Planets, races, species, organizations and their connected stories.</p></div><Button variant="outline" onClick={()=>setView('registry')}>Open Lore Codex â†’</Button></div>
              {/* Database Quick Category/Type Tabs */}
              <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 custom-scrollbar">
                <button
                  onClick={() => { setTypeFilter('All'); setStatusFilter('All'); }}
                  className={`px-3 py-1.5 rounded text-[10px] uppercase tracking-widest font-bold whitespace-nowrap transition-all ${typeFilter === 'All' && statusFilter === 'All' ? 'bg-gold-default text-black' : 'bg-neutral-black/60 border border-neutral-grey/20 text-neutral-grey hover:text-white'}`}
                >
                  All Archive ({lore.length})
                </button>
                <button
                  onClick={() => { setTypeFilter('canon'); setStatusFilter('All'); }}
                  className={`px-3 py-1.5 rounded text-[10px] uppercase tracking-widest font-bold whitespace-nowrap transition-all ${typeFilter === 'canon' ? 'bg-gold-default text-black' : 'bg-neutral-black/60 border border-neutral-grey/20 text-neutral-grey hover:text-white'}`}
                >
                  Verified Canon ({lore.filter(l => l.type === 'canon').length})
                </button>
                <button
                  onClick={() => { setTypeFilter('proposed'); setStatusFilter('All'); }}
                  className={`px-3 py-1.5 rounded text-[10px] uppercase tracking-widest font-bold whitespace-nowrap transition-all ${typeFilter === 'proposed' && statusFilter === 'All' ? 'bg-blue-500 text-white' : 'bg-neutral-black/60 border border-neutral-grey/20 text-neutral-grey hover:text-white'}`}
                >
                  On-Chain Proposals ({lore.filter(l => l.onChain).length})
                </button>
                <button
                  onClick={() => { setStatusFilter('in-vote'); }}
                  className={`px-3 py-1.5 rounded text-[10px] uppercase tracking-widest font-bold whitespace-nowrap transition-all ${statusFilter === 'in-vote' ? 'bg-gold-default text-black' : 'bg-neutral-black/60 border border-neutral-grey/20 text-neutral-grey hover:text-white'}`}
                >
                  Community Queue ({lore.filter(l => l.status === 'in-vote').length})
                </button>
                <button
                  onClick={() => { setStatusFilter('passed'); }}
                  className={`px-3 py-1.5 rounded text-[10px] uppercase tracking-widest font-bold whitespace-nowrap transition-all ${statusFilter === 'passed' ? 'bg-emerald-500 text-black' : 'bg-neutral-black/60 border border-neutral-grey/20 text-neutral-grey hover:text-white'}`}
                >
                  Enacted / Passed ({lore.filter(l => l.status_label === 'passed' || (l.onChain && l.status === 'active')).length})
                </button>
              </div>

              <AnimatePresence>
                {showFilters && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden mb-8"
                  >
                    <Card className="bg-neutral-black/60 border-gold-default/20">
                      <div className="space-y-6">
                        {/* Sector / Planet Filter */}
                        <div>
                          <h4 className="text-[10px] uppercase text-neutral-grey tracking-widest mb-3 flex items-center gap-2">
                            <div className="w-1 h-1 bg-purple-400 rounded-full" />
                            Sector / Planet
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {['All', 'Eyeke', 'Kavian', 'Magor', 'Naron', 'Neri', 'Veles', 'Federation'].map(planet => (
                              <button 
                                key={planet}
                                onClick={() => setPlanetFilter(planet)}
                                className={`text-[10px] px-3.5 py-1.5 border transition-all uppercase tracking-widest ${planetFilter === planet ? 'bg-purple-500 text-white border-purple-500' : 'border-neutral-grey/20 text-neutral-grey hover:border-purple-400/40'}`}
                              >
                                {planet}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Category Filter */}
                        <div>
                          <h4 className="text-[10px] uppercase text-neutral-grey tracking-widest mb-3 flex items-center gap-2">
                            <div className="w-1 h-1 bg-gold-default rounded-full" />
                            Category
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            <button 
                              onClick={() => setCategoryFilter('All')}
                              className={`text-[10px] px-4 py-2 border transition-all uppercase tracking-widest ${categoryFilter === 'All' ? 'bg-gold-default text-neutral-black border-gold-default' : 'border-neutral-grey/20 text-neutral-grey hover:border-gold-default/40'}`}
                            >
                              All Categories
                            </button>
                            {categories.map(cat => (
                              <button 
                                key={cat}
                                onClick={() => setCategoryFilter(cat)}
                                className={`text-[10px] px-4 py-2 border transition-all uppercase tracking-widest ${categoryFilter === cat ? 'bg-gold-default text-neutral-black border-gold-default' : 'border-neutral-grey/20 text-neutral-grey hover:border-gold-default/40'}`}
                              >
                                {cat}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Tag Filter */}
                        <div>
                          <h4 className="text-[10px] uppercase text-neutral-grey tracking-widest mb-3 flex items-center gap-2">
                            <div className="w-1 h-1 bg-gold-default rounded-full" />
                            Tags (Multi-select)
                          </h4>
                          <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                            <button 
                              onClick={() => setTagFilters([])}
                              className={`text-[10px] px-3 py-1.5 border transition-all uppercase tracking-widest ${tagFilters.length === 0 ? 'bg-gold-default text-neutral-black border-gold-default' : 'border-neutral-grey/20 text-neutral-grey hover:border-gold-default/40'}`}
                            >
                              All Tags
                            </button>
                            {ALL_LORE_TAGS.map(tag => {
                              const isSelected = tagFilters.includes(tag);
                              return (
                                <button 
                                  key={tag}
                                  onClick={() => {
                                    if (isSelected) {
                                      setTagFilters(tagFilters.filter(t => t !== tag));
                                    } else {
                                      setTagFilters([...tagFilters, tag]);
                                    }
                                  }}
                                  className={`text-[10px] px-3 py-1.5 border transition-all uppercase tracking-widest ${isSelected ? 'bg-gold-default text-neutral-black border-gold-default' : 'border-neutral-grey/20 text-neutral-grey hover:border-gold-default/40'}`}
                                >
                                  {tag}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="flex justify-between items-center pt-4 border-t border-neutral-grey/10">
                          <button 
                            onClick={() => {
                              setCategoryFilter('All');
                              setTagFilters([]);
                              setTypeFilter('All');
                              setPlanetFilter('All');
                              setStatusFilter('All');
                              setSearchQuery('');
                            }}
                            className="text-[10px] uppercase text-neutral-grey hover:text-gold-default transition-colors flex items-center gap-2"
                          >
                            <X size={12} /> Reset All Filters
                          </button>
                          <button 
                            onClick={() => setShowFilters(false)}
                            className="text-[10px] uppercase text-gold-default hover:underline tracking-widest"
                          >
                            Close Panel
                          </button>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredLore.map(item => {
                  const isGated = item.requiredNFT && !ownedTemplateIds.has(item.requiredNFT);
                  const totalVotes = (item.votes_for || 0) + (item.votes_against || 0);
                  const forPercentage = totalVotes > 0 ? Math.round(((item.votes_for || 0) / totalVotes) * 100) : 0;
                  return (
                    <motion.div
                      key={item.id}
                      whileHover={{ y: -2 }}
                      transition={{ duration: 0.15 }}
                    >
                      <Card 
                        title={item.category} 
                        className="h-full hover:border-gold-default/40 cursor-pointer group flex flex-col justify-between"
                        onClick={() => openLoreDetail(item)}
                      >
                        <div>
                          <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-3">
                              {item.category === 'Planets' && (
                                <div className="w-16 h-16 relative flex-shrink-0 flex items-center justify-center">
                                  <div className="absolute inset-0 bg-gold-default/5 rounded-full blur-xl animate-pulse" />
                                  {(item.imageUrl || getPlanetImage(item.primaryWorld)) ? (
                                    <img
                                      src={item.imageUrl || getPlanetImage(item.primaryWorld)}
                                      alt={item.title}
                                      className="w-full h-full object-contain relative z-10 drop-shadow-[0_0_15px_rgba(251,191,36,0.2)] animate-float"
                                      referrerPolicy="no-referrer"
                                    />
                                  ) : (
                                    <Globe size={34} className="relative z-10 text-gold-default/60" />
                                  )}
                                </div>
                              )}
                              <div>
                                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                  {item.onChain && (
                                    <Badge color="blue">
                                      Proposal #{item.proposal_id || item.id}
                                    </Badge>
                                  )}
                                  {item.planet && (
                                    <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 uppercase">
                                      {item.planet}
                                    </span>
                                  )}
                                  {item.status_label && (
                                    <span className={`text-[8px] uppercase font-mono font-bold px-1.5 py-0.5 rounded ${
                                      item.status_label === 'passed' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-blue-500/20 text-blue-300'
                                    }`}>
                                      {item.status_label}
                                    </span>
                                  )}
                                </div>
                                <h4 className="font-bold tracking-tighter uppercase italic leading-tight text-lg group-hover:text-gold-default transition-colors">
                                  {item.title}
                                </h4>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {item.requiredNFT && (
                                <Badge color="blue">
                                  <Shield size={10} className="mr-1" />
                                  Gated
                                </Badge>
                              )}
                              <Badge color={item.type === 'canon' ? 'white' : 'gold'}>{item.provenance === 'community-submission' && item.status === 'active' ? 'Community approved' : item.type}</Badge>
                            </div>
                          </div>

                          {isGated ? (
                            <div className="flex flex-col items-center justify-center py-8 text-center bg-neutral-black/40 rounded border border-dashed border-neutral-grey/20 mb-4">
                              <Shield size={24} className="text-neutral-grey/40 mb-2" />
                              <p className="text-[10px] uppercase tracking-widest text-neutral-grey">Restricted Archive</p>
                              <p className="text-[8px] text-neutral-grey/60 mt-1">Requires NFT Template: {item.requiredNFT}</p>
                            </div>
                          ) : (
                            <p className="text-xs text-neutral-grey line-clamp-3 mb-4 leading-relaxed">
                              {normalizeLoreMarkdown(item.content).replace(/[#*`]/g, '')}
                            </p>
                          )}

                          {/* Tags list in database card */}
                          {item.tags && item.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-4">
                              {item.tags.slice(0, 3).map(tag => (
                                <span
                                  key={tag}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setTagFilters([tag]);
                                    setShowFilters(true);
                                  }}
                                  className="text-[9px] px-1.5 py-0.5 bg-neutral-black/60 border border-neutral-grey/15 text-neutral-grey hover:text-gold-default hover:border-gold-default/40 transition-all uppercase tracking-widest"
                                >
                                  #{tag}
                                </span>
                              ))}
                              {item.tags.length > 3 && (
                                <span className="text-[9px] text-neutral-grey/60 px-1 py-0.5 font-mono">
                                  +{item.tags.length - 3}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Quorum / Votes Meter if on-chain or community proposal */}
                          {(item.onChain || item.votes_for !== undefined) && totalVotes > 0 && (
                            <div className="my-2 p-2 bg-neutral-white/[0.02] border border-neutral-grey/10 rounded">
                              <div className="flex justify-between text-[9px] font-mono text-neutral-grey mb-1">
                                <span className="text-emerald-400">FOR: {item.votes_for || 0}</span>
                                <span className="text-gold-default">{forPercentage}% Quorum</span>
                                <span className="text-rose-400">AGAINST: {item.votes_against || 0}</span>
                              </div>
                              <div className="w-full bg-neutral-grey/20 h-1 rounded-full overflow-hidden flex">
                                <div className="bg-emerald-400 h-full" style={{ width: `${forPercentage}%` }} />
                                <div className="bg-rose-500 h-full" style={{ width: `${100 - forPercentage}%` }} />
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="mt-auto">
                          <div className="pt-4 border-t border-neutral-grey/5 flex items-center justify-between text-[10px] text-neutral-grey uppercase tracking-widest mb-4">
                            <button 
                              onClick={(e) => { e.stopPropagation(); viewAuthorProfile(item.authorId); }}
                              className="flex flex-col items-start gap-0.5 text-blue-default hover:text-blue-hover transition-colors"
                            >
                              <div className="flex items-center gap-1 font-bold">
                                <UserIcon size={10} /> {item.authorName}
                              </div>
                              {item.waxAccount && (
                                <span className="text-[8px] opacity-60 lowercase font-mono">
                                  {item.waxAccount}
                                </span>
                              )}
                            </button>
                            <span className="flex items-center gap-1">
                              <ThumbsUp size={10} className={item.voteCount > 0 ? 'text-success-default' : ''} />
                              <span className={item.voteCount !== 0 ? (item.voteCount > 0 ? 'text-success-default' : 'text-error-default') : ''}>
                                {item.voteCount || 0}
                              </span>
                            </span>
                          </div>
                          <Button 
                            variant="outline" 
                            onClick={(e) => {
                              e.stopPropagation();
                              openLoreDetail(item);
                            }}
                            className="w-full justify-center text-[10px] h-8 group-hover:border-gold-default/40 group-hover:text-gold-default"
                          >
                            Read Transmission <ChevronRight size={12} className="ml-1" />
                          </Button>
                        </div>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
              {filteredLore.length === 0 && (
                <div className="text-center py-20 opacity-40 uppercase tracking-[0.5em]">No records found in the archive</div>
              )}
            </motion.div>
          )}

          {view === 'detail' && selectedLore && (
            <motion.div
              key="detail"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-4xl mx-auto"
            >
              <Button onClick={() => setView(readerReturn.current)} variant="ghost" className="mb-6 -ml-4">
                <ChevronRight size={16} className="rotate-180" />
                <span className="text-xs font-bold uppercase tracking-widest">{readerReturn.current==='player'?'Back to expeditions':'Back to archive'}</span>
              </Button>

              <Card className="p-8">
                <div className="flex flex-col md:flex-row justify-between items-start gap-6 mb-8 border-b border-neutral-grey/10 pb-8">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge color={selectedLore.type === 'canon' ? 'white' : 'gold'}>{selectedLore.provenance === 'community-submission' && selectedLore.status === 'active' ? 'Community approved' : selectedLore.type}</Badge>
                      <span className="text-[10px] uppercase text-neutral-grey tracking-widest">{selectedLore.category}</span>
                      {selectedLore.onChain && (
                        <Badge color="blue">
                          Proposal #{selectedLore.proposal_id || selectedLore.id}
                        </Badge>
                      )}
                      {selectedLore.planet && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPlanet(selectedLore.planet || null);
                            setView('planet');
                          }}
                          className="text-[9px] font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 uppercase hover:text-white hover:border-purple-300/50 transition-colors"
                          title={`Explore ${selectedLore.planet} in the Atlas`}
                        >
                          Sector: {selectedLore.planet}
                        </button>
                      )}
                      {selectedLore.status_label && (
                        <span className={`text-[9px] uppercase font-mono font-bold px-2 py-0.5 rounded ${
                          selectedLore.status_label === 'passed' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-blue-500/20 text-blue-300'
                        }`}>
                          Status: {selectedLore.status_label}
                        </span>
                      )}
                      {selectedLore.onChain && selectedLore.pull_request_id && selectedLore.narrative_source_status && (
                        <span
                          className={`text-[9px] uppercase font-mono font-bold px-2 py-0.5 rounded border ${
                            selectedLore.narrative_source_status === 'resolved'
                              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                              : selectedLore.narrative_source_status === 'legacy_salvage'
                                ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                                : 'bg-neutral-white/5 text-neutral-grey border-neutral-grey/20'
                          }`}
                          title={selectedLore.narrative_source_reason || undefined}
                        >
                          Narrative: {selectedLore.narrative_source_status === 'resolved' ? 'verified source' : selectedLore.narrative_source_status === 'legacy_salvage' ? 'legacy salvage' : 'unresolved'}
                        </span>
                      )}
                    </div>
                    <h2 className="text-4xl font-bold tracking-tighter uppercase italic leading-none text-neutral-white">{selectedLore.title}</h2>
                    {selectedLore.governanceTitle && selectedLore.governanceTitle !== selectedLore.title && (
                      <div className="text-[10px] font-mono text-neutral-grey/80 border-l-2 border-blue-500/30 pl-2">
                        Governance proposal: <span className="text-blue-300">{selectedLore.governanceTitle}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-4 text-xs text-neutral-grey flex-wrap">
                      <button 
                        onClick={() => viewAuthorProfile(selectedLore.authorId)}
                        className="flex items-center gap-2 text-blue-default hover:text-blue-hover transition-colors group"
                      >
                        <UserIcon size={14} className="text-neutral-grey group-hover:text-neutral-white" />
                        <span className="font-bold uppercase tracking-widest">{selectedLore.authorName}</span>
                      </button>
                      {selectedLore.waxAccount && (
                        <span className="text-[10px] text-blue-default/80 font-mono lowercase bg-blue-500/10 px-1.5 py-0.5 rounded">
                          {selectedLore.waxAccount}
                        </span>
                      )}
                      <span className="text-neutral-grey/20">|</span>
                      <span>{selectedLore.sourceHash ? 'Pinned source edition' : new Date(selectedLore.createdAt?.seconds * 1000).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {selectedLore.imageUrl && (
                    <div className="w-full md:w-48 h-48 flex items-center justify-center relative flex-shrink-0">
                      <div className="absolute inset-0 bg-gold-default/5 rounded-full blur-2xl animate-pulse" />
                      <img 
                        src={selectedLore.imageUrl} 
                        alt={selectedLore.title} 
                        referrerPolicy="no-referrer" 
                        className="w-full h-full object-contain relative z-10 drop-shadow-[0_0_30px_rgba(251,191,36,0.2)] animate-float" 
                      />
                    </div>
                  )}
                  
                  <div className="flex items-center gap-2">
                    {profile?.role === 'scribe' && (
                      <Button 
                        variant="danger"
                        onClick={() => handleDeleteLore(selectedLore.id)}
                        className="p-3"
                        title="Delete Transmission"
                      >
                        <Trash2 size={20} />
                      </Button>
                    )}
                    {user && (
                      <Button 
                        variant={profile?.bookmarks?.some(id=>sourceRecordId(id)===selectedLore.id) ? 'primary' : 'outline'}
                        onClick={() => handleBookmark(selectedLore.id)}
                        className="p-3"
                      >
                        <Bookmark size={20} fill={profile?.bookmarks?.some(id=>sourceRecordId(id)===selectedLore.id) ? 'currentColor' : 'none'} />
                      </Button>
                    )}
                    {selectedLore.ipfs_cid && (
                      <span className="text-[10px] bg-neutral-white/5 border border-neutral-grey/20 px-2.5 py-1.5 rounded text-neutral-grey font-mono flex items-center gap-1.5" title={`IPFS CID: ${selectedLore.ipfs_cid}`}>
                        <span className="text-blue-400 font-bold">IPFS:</span> {selectedLore.ipfs_cid.slice(0, 8)}...
                      </span>
                    )}
                    {selectedLore.tx_id && (
                      <a href={`https://waxblock.io/transaction/${selectedLore.tx_id}`} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" className="gap-2">
                          <Globe size={16} />
                          <span className="text-xs font-bold uppercase text-blue-400">WAX Explorer</span>
                        </Button>
                      </a>
                    )}
                    {selectedLore.sourceUrl && (
                      <a href={selectedLore.sourceUrl} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" className="gap-2">
                          <Globe size={16} />
                          <span className="text-xs font-bold uppercase">Source</span>
                        </Button>
                      </a>
                    )}
                  </div>
                </div>

                {readerError && <div role="alert" className="mb-6 border border-error-default/40 p-4"><p>{readerError}</p><Button onClick={()=>setReaderRetry(value=>value+1)}>Retry full transmission</Button></div>}
                {selectedLore.onChain && selectedLore.contentComplete && selectedLore.narrative_source_status !== 'resolved' && <div role="status" className="mb-6 border border-gold-default/30 p-4 text-sm"><p className="text-gold-default">Story source unavailable</p><p className="text-neutral-grey mt-2">The text below is the governance proposal, not the complete story. Source status: {selectedLore.narrative_source_status || 'unresolved'}.</p></div>}
                {loadingFullLore ? (
                  <div className="py-12 flex flex-col items-center justify-center space-y-3 text-center border border-gold-default/20 rounded bg-neutral-black/40 mb-8">
                    <Loader2 size={24} className="animate-spin text-gold-default" />
                    <span className="text-xs uppercase tracking-[0.2em] font-mono text-neutral-grey">
                      Retrieving Full Transmission from Canon Contract...
                    </span>
                  </div>
                ) : (
                  <div className="prose prose-invert max-w-none mb-8 text-neutral-white leading-relaxed">
                    {!!sourceStoryForId(selectedLore.id) && <div className="flex flex-wrap items-center gap-3 mb-5"><Button onClick={recordStoryDiscovery}>Record story discovery</Button><span role="status" className="text-xs text-neutral-grey">{discoveryMessage || 'Study this work for at least 20 seconds before recording it.'}</span></div>}
                    <StoryContents content={selectedLore.content} />
                    <LoreContent content={selectedLore.content} onLinkClick={handleLoreLinkClick} />
                    {!!sourceStoryForId(selectedLore.id) && <div className="mt-6 border-t border-gold-default/20 pt-4"><Button onClick={recordStoryDiscovery}>{!user?'Sign in to save discoveries':!playerReady?'Create your explorer':'Record this discovery'}</Button><p className="text-xs text-neutral-grey mt-3">Study this transmission for at least 20 seconds, then record it in your personal codex. Each story rewards discovery once.</p>{discoveryMessage&&<p role="status" className="text-sm text-gold-default mt-2">{discoveryMessage}</p>}</div>}
                  </div>
                )}

                {/* Extracted Entities & Relationships */}
                {((selectedLore.entities && selectedLore.entities.length > 0) || 
                  (selectedLore.relationships && selectedLore.relationships.length > 0) || 
                  (selectedLore.events && selectedLore.events.length > 0)) && (
                  <div className="my-8 p-4 bg-neutral-white/[0.02] border border-neutral-grey/15 rounded-lg space-y-4">
                    <h3 className="text-xs font-mono uppercase tracking-[0.2em] text-gold-default font-bold flex items-center gap-2">
                      <Sparkles size={14} /> Lore Index Graph & Entity Telemetry
                    </h3>
                    
                    {selectedLore.entities && selectedLore.entities.length > 0 && (
                      <div>
                        <span className="text-[10px] uppercase text-neutral-grey tracking-widest block mb-1.5">Indexed Entities</span>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedLore.entities.map((e, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                setSearchQuery(e.name);
                                if (e.type?.toLowerCase().includes('planet')) setPlanetFilter(e.name);
                                else if (e.type?.toLowerCase().includes('specie')) setCategoryFilter('Species');
                                else if (e.type?.toLowerCase().includes('faction')) setCategoryFilter('Factions');
                                else if (e.type?.toLowerCase().includes('tech')) setCategoryFilter('Technology');
                                else setCategoryFilter('All');
                                setView('database');
                              }}
                              className="text-[10px] px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 text-blue-300 font-mono rounded hover:border-gold-default/50 hover:text-gold-default transition-colors"
                              title={`Explore ${e.name} across the archive`}
                            >
                              {e.name} <span className="opacity-60 text-[8px]">({e.type})</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedLore.relationships && selectedLore.relationships.length > 0 && (
                      <div>
                        <span className="text-[10px] uppercase text-neutral-grey tracking-widest block mb-1.5">Entity Relationships</span>
                        <div className="space-y-1">
                          {selectedLore.relationships.map((rel, idx) => (
                            <div key={idx} className="text-[10px] text-neutral-grey flex items-center gap-2 font-mono">
                              <span className="text-neutral-white font-bold">{rel.subject}</span>
                              <span className="text-gold-default opacity-80">â†’ [{rel.predicate.replace('_', ' ')}] â†’</span>
                              <span className="text-blue-300 font-bold">{rel.object}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedLore.events && selectedLore.events.length > 0 && (
                      <div>
                        <span className="text-[10px] uppercase text-neutral-grey tracking-widest block mb-1.5">Timeline Events</span>
                        <div className="space-y-2">
                          {selectedLore.events.map((ev, idx) => (
                            <div key={idx} className="p-2 bg-neutral-white/5 border-l-2 border-gold-default">
                              <p className="text-xs text-neutral-white font-bold">{ev.name}</p>
                              <p className="text-[10px] text-neutral-grey italic">{ev.description}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {selectedLore.tags && selectedLore.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-12">
                    {selectedLore.tags.map(tag => (
                      <button 
                        key={tag} 
                        onClick={() => {
                          setTagFilters([tag]);
                          setShowFilters(true);
                          setView('database');
                        }}
                        className="text-[10px] px-2 py-1 bg-neutral-black/60 border border-neutral-grey/20 text-neutral-grey hover:text-gold-default hover:border-gold-default/40 transition-all uppercase tracking-widest"
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
                )}

                {/* Voting Section - Always at bottom of expanded piece */}
                <div className="mt-12 pt-8 border-t border-neutral-grey/10">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                    <div>
                      <h4 className="text-sm font-bold uppercase tracking-widest mb-1 text-gold-default">Community Consensus</h4>
                      <p className="text-[10px] text-neutral-grey uppercase tracking-widest">Cast your vote to influence the metaverse lore</p>
                      
                      {/* Quorum status if on-chain */}
                      {selectedLore.onChain && (
                        <div className="mt-2 text-[10px] font-mono text-neutral-grey">
                          <span className="text-emerald-400 font-bold">FOR: {selectedLore.votes_for || 0}</span>
                          <span className="mx-2 opacity-40">|</span>
                          <span className="text-rose-400 font-bold">AGAINST: {selectedLore.votes_against || 0}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 bg-neutral-black/40 p-1 border border-neutral-grey/10">
                        <Button 
                          variant={userVotes[selectedLore.id] === 'up' ? 'primary' : 'outline'} 
                          className="p-2 h-10 w-10"
                          onClick={() => handleVote(selectedLore.id, 'up')}
                        >
                          <ThumbsUp size={18} />
                        </Button>
                        <div className="px-4 text-center min-w-[60px]">
                          <span className={`text-xl font-bold ${selectedLore.voteCount >= 0 ? 'text-success-default' : 'text-error-default'}`}>
                            {selectedLore.voteCount > 0 ? '+' : ''}{selectedLore.voteCount || 0}
                          </span>
                        </div>
                        <Button 
                          variant={userVotes[selectedLore.id] === 'down' ? 'danger' : 'outline'}
                          className="p-2 h-10 w-10"
                          onClick={() => handleVote(selectedLore.id, 'down')}
                        >
                          <ThumbsDown size={18} />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Related Lore */}
                <div className="mt-12 pt-8 border-t border-neutral-grey/10">
                  <h4 className="text-[10px] uppercase text-neutral-grey tracking-widest mb-4">Related Transmissions</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {lore
                      .filter(l => l.id !== selectedLore.id && (l.category === selectedLore.category || l.tags.some(t => selectedLore.tags.includes(t))))
                      .slice(0, 2)
                      .map(related => (
                        <div 
                          key={related.id}
                          onClick={() => setSelectedLore(related)}
                          className="p-4 border border-neutral-grey/10 bg-neutral-black/40 hover:bg-neutral-black/60 cursor-pointer transition-all group"
                        >
                          <p className="text-[10px] uppercase text-neutral-grey mb-1">{related.category}</p>
                          <h5 className="text-sm font-bold group-hover:text-gold-default transition-colors">{related.title}</h5>
                        </div>
                      ))}
                  </div>
                </div>
              </Card>

              {/* --- Comments Section --- */}
              <div className="mt-8 space-y-6">
                <div className="flex items-center gap-3 mb-4">
                  <MessageSquare size={20} className="text-neutral-grey" />
                  <h3 className="text-xl font-bold uppercase tracking-tighter italic text-gold-default">{PAGES ? 'Discussion on GitHub' : 'Archive Threads'}</h3>
                  <span className="text-[10px] text-neutral-grey/20 uppercase tracking-widest">({comments.length} Transmissions)</span>
                </div>

                <div className="space-y-4">
                  {comments.map(comment => (
                    <Card key={comment.id} className="p-4 bg-neutral-white/5 border-neutral-grey/5">
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-neutral-white">{comment.userName}</span>
                          <span className="text-[10px] text-neutral-grey/20 uppercase tracking-widest">
                            {comment.createdAt?.seconds ? new Date(comment.createdAt.seconds * 1000).toLocaleString() : 'Transmitting...'}
                          </span>
                        </div>
                        {profile?.role === 'scribe' && (
                          <Button 
                            variant="ghost" 
                            onClick={() => handleDeleteComment(comment.id)}
                            className="h-6 w-6 p-0 text-error-default hover:text-error-hover"
                          >
                            <Trash2 size={12} />
                          </Button>
                        )}
                      </div>
                      <p className="text-sm text-neutral-grey leading-relaxed">{comment.text}</p>
                    </Card>
                  ))}
                  {comments.length === 0 && (
                    <div className="text-center py-8 border border-neutral-grey/5 bg-neutral-white/5 opacity-40 uppercase text-[10px] tracking-[0.3em] text-neutral-grey">
                      {PAGES ? 'Discussions and submissions are reviewed on GitHub' : 'No active threads for this entry'}
                    </div>
                  )}
                </div>

                {user ? (
                  <Card title="New Transmission" className="mt-8">
                    <form onSubmit={handleComment} className="space-y-4">
                      <textarea
                        placeholder="ADD TO THE THREAD..."
                        rows={3}
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        className="w-full bg-neutral-black/40 border border-neutral-grey/10 p-4 text-sm focus:outline-none focus:border-gold-default/40 font-mono resize-none text-neutral-white"
                      />
                      <div className="flex justify-end">
                        <Button type="submit" disabled={!newComment.trim() || submitting}>
                          <MessageSquare size={16} />
                          <span className="text-xs font-bold uppercase">{submitting ? 'Transmitting...' : PAGES ? 'Continue on GitHub' : 'Transmit to Thread'}</span>
                        </Button>
                      </div>
                    </form>
                  </Card>
                ) : (
                  <div className="text-center py-8 border border-neutral-grey/5 bg-neutral-white/5 opacity-40 uppercase text-[10px] tracking-[0.3em] text-neutral-grey">
                    Connect terminal to participate in threads
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {view === 'author-profile' && selectedAuthorProfile && (
            <motion.div
              key="author-profile"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-6xl mx-auto"
            >
              <div className="flex items-center gap-6 mb-12">
                <div className="w-24 h-24 rounded-full border-2 border-neutral-grey/20 overflow-hidden bg-neutral-black/40">
                  {selectedAuthorProfile.avatarUrl ? (
                    <img src={selectedAuthorProfile.avatarUrl} alt="Avatar" referrerPolicy="no-referrer" />
                  ) : (
                    <UserIcon size={48} className="m-auto mt-6 text-neutral-grey/20" />
                  )}
                </div>
                <div>
                  <h2 className="text-4xl font-bold tracking-tighter uppercase italic text-gold-default">{selectedAuthorProfile.displayName}</h2>
                  <div className="flex items-center gap-3 mt-1">
                    <Badge color={selectedAuthorProfile.role === 'scribe' ? 'gold' : selectedAuthorProfile.role === 'skribus' ? 'white' : 'blue'}>
                      {selectedAuthorProfile.role}
                    </Badge>
                    {selectedAuthorProfile.waxAccount && (
                      <span className="text-[10px] text-blue-default font-mono uppercase tracking-widest">WAX: {selectedAuthorProfile.waxAccount}</span>
                    )}
                    <span className="text-[10px] uppercase text-neutral-grey tracking-widest">Reputation: {selectedAuthorProfile.reputation || 0}</span>
                    <span className="text-[10px] uppercase text-neutral-grey tracking-widest">Rank: {getRank(selectedAuthorProfile.reputation)}</span>
                    
                    {profile?.role === 'scribe' && selectedAuthorProfile.uid !== 'federation-archive' && (
                      <div className="flex items-center gap-2 ml-4 border-l border-neutral-grey/20 pl-4">
                        <span className="text-[10px] uppercase text-gold-default font-bold">Admin Actions:</span>
                        {(['scribe', 'skribus', 'skiv', 'reader'] as const).map((r) => (
                          <button
                            key={r}
                            onClick={() => handleUpdateUserRole(selectedAuthorProfile.uid, r)}
                            className={`text-[9px] uppercase px-2 py-0.5 border ${selectedAuthorProfile.role === r ? 'bg-gold-default text-black border-gold-default' : 'text-neutral-grey border-neutral-grey/20 hover:border-gold-default/50'}`}
                          >
                            Set {r}
                          </button>
                        ))}
                      </div>
                    )}

                    {user && user.uid !== selectedAuthorProfile.uid && (
                      <Button 
                        variant={profile?.following?.includes(selectedAuthorProfile.uid) ? 'primary' : 'outline'}
                        size="sm"
                        onClick={() => handleFollow(selectedAuthorProfile.uid)}
                        className="h-7 px-3 text-[10px]"
                      >
                        {profile?.following?.includes(selectedAuthorProfile.uid) ? 'Following' : 'Follow'}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="md:col-span-1 space-y-6">
                  <Card title="Transmission Bio">
                    <p className="text-sm text-neutral-grey leading-relaxed">
                      {selectedAuthorProfile.bio || "No bio available for this explorer."}
                    </p>
                  </Card>
                </div>

                <div className="md:col-span-2 space-y-6">
                  <h3 className="text-xl font-bold uppercase tracking-tighter italic border-b border-neutral-grey/10 pb-2 text-gold-default">Contributed Lore</h3>
                  <div className="space-y-4">
                    {lore.filter(l => l.authorId === selectedAuthorProfile.uid).map(item => (
                      <Card key={item.id} title={item.category} className="hover:border-gold-default/40 transition-all cursor-pointer group" onClick={() => { setSelectedLore(item); setView('detail'); }}>
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-bold text-lg leading-tight group-hover:text-gold-default transition-colors text-neutral-white">{item.title}</h4>
                          <Badge color={item.type === 'canon' ? 'white' : 'gold'}>{item.provenance === 'community-submission' && item.status === 'active' ? 'Community approved' : item.type}</Badge>
                        </div>
                        <p className="text-xs text-neutral-grey line-clamp-2 mb-4">{normalizeLoreMarkdown(item.content).replace(/[#*`]/g, '')}</p>
                        <div className="flex items-center justify-between text-[10px] text-neutral-grey uppercase">
                          <span className="flex items-center gap-1">
                            <ThumbsUp size={10} className={item.voteCount > 0 ? 'text-success-default' : ''} />
                            {item.voteCount || 0}
                          </span>
                          <span>{item.sourceHash ? 'Pinned source edition' : new Date(item.createdAt?.seconds * 1000).toLocaleDateString()}</span>
                        </div>
                      </Card>
                    ))}
                    {lore.filter(l => l.authorId === selectedAuthorProfile.uid).length === 0 && (
                      <div className="text-center py-12 opacity-40 uppercase tracking-widest text-xs border border-dashed border-neutral-grey/10 text-neutral-grey">
                        No lore contributions found
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="mt-12">
                <Button onClick={() => setView('database')} variant="outline">
                  <ChevronRight size={16} className="rotate-180" />
                  Back to Archive
                </Button>
              </div>
            </motion.div>
          )}

          {view === 'voting' && (
            <motion.div
              key="voting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-6xl mx-auto space-y-8 pb-16"
            >
              {/* Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-4xl font-black tracking-tighter uppercase italic text-gold-default terminal-text-glow">Governance & Telemetry Ledger</h2>
                  <p className="text-xs text-neutral-grey uppercase tracking-[0.2em]">Decentralized lore.worlds Canon Proposals & Consensus Tally</p>
                </div>
                <Button 
                  onClick={() => setView('propose')}
                  className="gap-2 bg-gold-default text-black hover:bg-gold-hover self-start md:self-auto"
                >
                  <Plus size={16} />
                  <span className="text-xs font-bold uppercase tracking-widest">Submit Proposal</span>
                </Button>
              </div>

              {/* Live Telemetry Banner */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 bg-neutral-black/60 border border-neutral-grey/15 rounded-lg">
                  <span className="text-[10px] uppercase tracking-widest text-neutral-grey block mb-1">Total Canon Proposals</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black font-mono text-gold-default">
                      {governanceTelemetry?.total_proposals ?? canonProposals.length}
                    </span>
                    <span className="text-[10px] text-emerald-400 font-mono font-bold">ON-CHAIN</span>
                  </div>
                </div>
                <div className="p-4 bg-neutral-black/60 border border-neutral-grey/15 rounded-lg">
                  <span className="text-[10px] uppercase tracking-widest text-neutral-grey block mb-1">Passed to Canon</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black font-mono text-emerald-400">
                      {governanceTelemetry?.passed_proposals ?? 0}
                    </span>
                    <span className="text-[10px] text-neutral-grey font-mono">ENACTED</span>
                  </div>
                </div>
                <div className="p-4 bg-neutral-black/60 border border-neutral-grey/15 rounded-lg">
                  <span className="text-[10px] uppercase tracking-widest text-neutral-grey block mb-1">Quorum Pass Rate</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black font-mono text-blue-400">
                      {governanceTelemetry?.pass_rate_pct ?? 0}%
                    </span>
                    <span className="text-[10px] text-neutral-grey font-mono">CONSENSUS</span>
                  </div>
                </div>
                <div className="p-4 bg-neutral-black/60 border border-neutral-grey/15 rounded-lg">
                  <span className="text-[10px] uppercase tracking-widest text-neutral-grey block mb-1">Active Scribes</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black font-mono text-neutral-white">
                      {governanceTelemetry?.active_scribes ?? 0}
                    </span>
                    <span className="text-[10px] text-gold-default font-mono">AUTHORS</span>
                  </div>
                </div>
              </div>

              {/* Filters & Tabs */}
              <div className="space-y-3 bg-neutral-black/40 p-4 rounded-lg border border-neutral-grey/15">
                <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
                  <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-grey" size={16} />
                    <input
                      type="text"
                      placeholder="FILTER PROPOSALS BY KEYWORD, SCRIBE, OR TAG..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-neutral-black/60 border border-neutral-grey/20 py-2 pl-9 pr-3 text-xs focus:outline-none focus:border-gold-default/40 uppercase tracking-widest text-neutral-white"
                    />
                  </div>

                  {/* Planet Selector */}
                  <div className="flex items-center gap-2 w-full md:w-auto">
                    <span className="text-[10px] uppercase tracking-widest text-neutral-grey">Sector:</span>
                    <select
                      value={govPlanetFilter}
                      onChange={(e) => setGovPlanetFilter(e.target.value)}
                      className="bg-neutral-black border border-neutral-grey/20 text-[10px] uppercase tracking-widest text-gold-default p-2 rounded focus:outline-none focus:border-gold-default flex-1 md:flex-none"
                    >
                      <option value="All">All Sectors</option>
                      <option value="Eyeke">Eyeke</option>
                      <option value="Kavian">Kavian</option>
                      <option value="Magor">Magor</option>
                      <option value="Naron">Naron</option>
                      <option value="Neri">Neri</option>
                      <option value="Veles">Veles</option>
                      <option value="Federation">Federation</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t border-neutral-grey/10">
                  <button
                    id="gov-tab-all"
                    onClick={() => setGovActiveTab('all')}
                    className={`px-3 py-1.5 rounded text-[10px] uppercase tracking-widest transition-all font-bold ${govActiveTab === 'all' ? 'bg-gold-default text-black' : 'bg-neutral-white/5 text-neutral-grey hover:text-white'}`}
                  >
                    All Proposals ({canonProposals.length + lore.filter(l => l.status === 'in-vote').length})
                  </button>
                  <button
                    id="gov-tab-onchain"
                    onClick={() => setGovActiveTab('onchain')}
                    className={`px-3 py-1.5 rounded text-[10px] uppercase tracking-widest transition-all font-bold ${govActiveTab === 'onchain' ? 'bg-blue-500 text-white' : 'bg-neutral-white/5 text-neutral-grey hover:text-white'}`}
                  >
                    On-Chain Canon ({canonProposals.length})
                  </button>
                  <button
                    id="gov-tab-community"
                    onClick={() => setGovActiveTab('community')}
                    className={`px-3 py-1.5 rounded text-[10px] uppercase tracking-widest transition-all font-bold ${govActiveTab === 'community' ? 'bg-gold-default text-black' : 'bg-neutral-white/5 text-neutral-grey hover:text-white'}`}
                  >
                    Community Queue ({lore.filter(l => l.status === 'in-vote').length})
                  </button>
                  <button
                    id="gov-tab-telemetry"
                    onClick={() => setGovActiveTab('telemetry')}
                    className={`px-3 py-1.5 rounded text-[10px] uppercase tracking-widest transition-all font-bold ${govActiveTab === 'telemetry' ? 'bg-emerald-500 text-black' : 'bg-neutral-white/5 text-neutral-grey hover:text-white'}`}
                  >
                    Node Telemetry
                  </button>
                </div>
              </div>

              {/* Tab Content: On-Chain Proposals */}
              {(govActiveTab === 'all' || govActiveTab === 'onchain') && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-neutral-grey/10 pb-2">
                    <h3 className="text-xs font-mono uppercase tracking-[0.2em] text-blue-400 font-bold flex items-center gap-2">
                      <Globe size={14} /> On-Chain Canon Proposals (lore.worlds / tokelores)
                    </h3>
                    <span className="text-[10px] text-neutral-grey font-mono">Consensus: see proposal rules</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {canonProposals
                      .filter(p => {
                        const indexed = transformProposalToLoreEntry(p);
                        const matchesPlanet = govPlanetFilter === 'All' || indexed.primaryWorld?.toLowerCase() === govPlanetFilter.toLowerCase();
                        const q = searchQuery.toLowerCase();
                        const matchesSearch = !q ||
                          p.title.toLowerCase().includes(q) ||
                          indexed.title.toLowerCase().includes(q) ||
                          indexed.content.toLowerCase().includes(q) ||
                          (p.proposer && p.proposer.toLowerCase().includes(q));
                        return matchesPlanet && matchesSearch;
                      })
                      .map((prop) => {
                        const totalVotes = (prop.votes_for || 0) + (prop.votes_against || 0);
                        const forPercentage = totalVotes > 0 ? Math.round(((prop.votes_for || 0) / totalVotes) * 100) : 0;
                        const transformed = transformProposalToLoreEntry(prop);
                        return (
                          <Card key={`onchain-${prop.id}`} className="flex flex-col border-blue-500/20 hover:border-blue-400/40 transition-all bg-neutral-black/60">
                            <div className="flex justify-between items-start mb-3">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge color={prop.planet?.toLowerCase() === 'federation' ? 'gold' : 'blue'}>
                                    {prop.planet || 'Alien Worlds'}
                                  </Badge>
                                  <span className="text-[9px] font-mono text-neutral-grey/80">ID: {prop.id}</span>
                                </div>
                                <h4 className="font-bold text-base leading-snug text-neutral-white">{prop.title}</h4>
                              </div>
                              <span className={`text-[9px] uppercase px-2 py-0.5 rounded font-mono font-bold ${
                                prop.status_label === 'passed' || prop.status === 2
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                                  : prop.status_label === 'active' || prop.status === 1
                                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30 animate-pulse' 
                                  : 'bg-neutral-white/10 text-neutral-grey border border-neutral-grey/20'
                              }`}>
                                {prop.status_label || (prop.status === 2 ? 'passed' : prop.status === 1 ? 'active' : 'draft')}
                              </span>
                            </div>

                            <div className="text-xs text-neutral-grey mb-3 leading-relaxed space-y-1">
                              {prop.narrative_source_status === 'resolved' && transformed.narrativeTitle ? (
                                <>
                                  <div className="text-[9px] uppercase tracking-widest text-emerald-400 font-mono">Verified narrative source</div>
                                  <div className="text-neutral-white/90 font-semibold">{transformed.narrativeTitle}</div>
                                  {transformed.narrativeAuthor && (
                                    <div className="text-[10px] font-mono text-neutral-grey">Narrative by {transformed.narrativeAuthor}</div>
                                  )}
                                </>
                              ) : (
                                <div className="text-[10px] font-mono text-neutral-grey/90">
                                  {prop.pull_request_id
                                    ? `Narrative source PR #${prop.pull_request_id} is not yet verified.`
                                    : 'No explicit GitHub narrative source is attached to this proposal.'}
                                </div>
                              )}
                            </div>

                            {/* Tags */}
                            {transformed.tags && transformed.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-3">
                                {transformed.tags.slice(0, 4).map(tag => (
                                  <span key={tag} className="text-[8px] px-1.5 py-0.5 bg-blue-500/10 text-blue-300 border border-blue-500/20 font-mono rounded">
                                    #{tag}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Vote Meter */}
                            <div className="space-y-1.5 my-2 p-2.5 bg-neutral-white/[0.02] border border-neutral-grey/10 rounded">
                              <div className="flex justify-between text-[10px] font-mono text-neutral-grey">
                                <span className="text-emerald-400 font-bold">FOR: {prop.votes_for || 0}</span>
                                <span className="text-gold-default">{forPercentage}% Quorum</span>
                                <span className="text-rose-400">AGAINST: {prop.votes_against || 0}</span>
                              </div>
                              <div className="w-full bg-neutral-grey/20 h-1.5 rounded-full overflow-hidden flex">
                                <div 
                                  className="bg-emerald-400 h-full transition-all" 
                                  style={{ width: `${forPercentage}%` }} 
                                />
                                <div 
                                  className="bg-rose-500 h-full transition-all" 
                                  style={{ width: `${100 - forPercentage}%` }} 
                                />
                              </div>
                            </div>

                            <div className="mt-auto pt-3 border-t border-neutral-grey/10 flex items-center justify-between text-[9px] font-mono text-neutral-grey mb-3">
                              <span className="truncate">Scribe: <span className="text-blue-300 font-bold">{prop.proposer}</span></span>
                              <div className="flex items-center gap-2">
                                {prop.ipfs_cid && (
                                  <span className="text-[8px] bg-neutral-white/5 px-1.5 py-0.5 rounded text-neutral-grey/80 font-mono" title={`IPFS CID: ${prop.ipfs_cid}`}>
                                    CID:{prop.ipfs_cid.slice(0, 6)}...
                                  </span>
                                )}
                                {prop.tx_id && (
                                  <a
                                    href={`https://waxblock.io/transaction/${prop.tx_id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-400 hover:underline flex items-center gap-0.5"
                                  >
                                    <span>Explorer</span>
                                    <ExternalLink size={8} />
                                  </a>
                                )}
                              </div>
                            </div>

                            <Button 
                              variant="outline" 
                              onClick={() => {
                                setSelectedLore(transformed);
                                setView('detail');
                              }}
                              className="w-full justify-center text-[10px] h-8 border-blue-500/30 hover:border-blue-400 text-blue-300"
                            >
                              Inspect Indexed Transmission
                            </Button>
                          </Card>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Tab Content: Community Proposals */}
              {(govActiveTab === 'all' || govActiveTab === 'community') && (
                <div className="space-y-4 pt-4">
                  <div className="flex items-center justify-between border-b border-neutral-grey/10 pb-2">
                    <h3 className="text-xs font-mono uppercase tracking-[0.2em] text-gold-default font-bold flex items-center gap-2">
                      <VoteIcon size={14} /> Community Scribe Proposals (Pending Review)
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {lore
                      .filter(l => l.status === 'in-vote' && (govPlanetFilter === 'All' || l.category.toLowerCase().includes(govPlanetFilter.toLowerCase()) || l.title.toLowerCase().includes(govPlanetFilter.toLowerCase())))
                      .map(item => (
                        <Card key={item.id} title={item.category} className="flex flex-col bg-neutral-black/60">
                          <div className="flex justify-between items-start mb-4">
                            <h4 className="font-bold text-lg leading-tight text-gold-default">{item.title}</h4>
                            <Badge color="gold">In Vote</Badge>
                          </div>
                          <p className="text-xs text-neutral-grey line-clamp-3 mb-6">{normalizeLoreMarkdown(item.content).replace(/[#*`]/g, '')}</p>
                          
                          <div className="mt-auto space-y-4">
                            <div className="flex items-center justify-between text-[10px] uppercase text-neutral-grey">
                              <span>Proposed by {item.authorName}</span>
                              <span>{item.sourceHash ? 'Pinned source edition' : new Date(item.createdAt?.seconds * 1000).toLocaleDateString()}</span>
                            </div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] uppercase text-neutral-grey tracking-widest">Net Consensus</span>
                              <span className={`text-[10px] font-bold ${item.voteCount >= 0 ? 'text-success-default' : 'text-error-default'}`}>
                                {item.voteCount > 0 ? '+' : ''}{item.voteCount || 0}
                              </span>
                            </div>
                            <div className="flex gap-2">
                              <Button 
                                onClick={() => { setSelectedLore(item); setView('detail'); }} 
                                variant="outline" 
                                className="flex-1 text-[10px]"
                              >
                                Review Full Text
                              </Button>
                              <div className="flex gap-1">
                                <Button 
                                  onClick={() => handleVote(item.id, 'up')} 
                                  variant={userVotes[item.id] === 'up' ? 'primary' : 'outline'}
                                  className="p-2"
                                >
                                  <ThumbsUp size={14} />
                                </Button>
                                <Button 
                                  onClick={() => handleVote(item.id, 'down')} 
                                  variant={userVotes[item.id] === 'down' ? 'danger' : 'outline'}
                                  className="p-2"
                                >
                                  <ThumbsDown size={14} />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </Card>
                      ))}

                    {lore.filter(l => l.status === 'in-vote').length === 0 && (
                      <div className="col-span-full text-center py-12 text-neutral-grey/40 uppercase tracking-[0.5em] border border-dashed border-neutral-grey/15 rounded-lg">
                        No active community proposals currently in vote
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab Content: Telemetry Nodes */}
              {govActiveTab === 'telemetry' && (
                <div className="space-y-4 pt-4">
                  <Card title="Hyperion History Endpoints">
                    <div className="space-y-4">
                      <p className="text-xs text-neutral-grey">
                        The Canon Engine connects directly to decentralized WAX Hyperion history nodes to index lore actions, governance votes, and NFT claims on scheduled refreshes. Endpoint reachability is not monitored by this panel.
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                        <div className="p-3 bg-neutral-black/60 border border-neutral-grey/10 rounded flex justify-between items-center">
                          <div>
                            <p className="text-neutral-white font-bold">api.waxsweden.org</p>
                            <p className="text-[10px] text-neutral-grey">Stockholm, Sweden (Primary)</p>
                          </div>
                          <span className="text-emerald-400 font-bold text-[10px] bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">NOT PROBED</span>
                        </div>
                        <div className="p-3 bg-neutral-black/60 border border-neutral-grey/10 rounded flex justify-between items-center">
                          <div>
                            <p className="text-neutral-white font-bold">wax.eu.eosamsterdam.net</p>
                            <p className="text-[10px] text-neutral-grey">Amsterdam, NL (Secondary)</p>
                          </div>
                          <span className="text-emerald-400 font-bold text-[10px] bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">NOT PROBED</span>
                        </div>
                        <div className="p-3 bg-neutral-black/60 border border-neutral-grey/10 rounded flex justify-between items-center">
                          <div>
                            <p className="text-neutral-white font-bold">wax.eosusa.news</p>
                            <p className="text-[10px] text-neutral-grey">Greenville, USA (Failover)</p>
                          </div>
                          <span className="text-emerald-400 font-bold text-[10px] bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">NOT PROBED</span>
                        </div>
                        <div className="p-3 bg-neutral-black/60 border border-neutral-grey/10 rounded flex justify-between items-center">
                          <div>
                            <p className="text-neutral-white font-bold">hyperion.wax.blacklusion.io</p>
                            <p className="text-[10px] text-neutral-grey">Frankfurt, DE (Failover)</p>
                          </div>
                          <span className="text-emerald-400 font-bold text-[10px] bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">NOT PROBED</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>
              )}
            </motion.div>
          )}

          {view === 'propose' && (
            <motion.div
              key="propose"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-6xl mx-auto"
            >
              <div className="flex flex-col lg:flex-row gap-8">
                <div className="flex-1 space-y-6">
                  <h2 className="text-3xl font-bold tracking-tighter uppercase italic mb-2 text-gold-default">New Lore Transmission</h2>{PAGES&&<p className="text-sm text-neutral-grey">Draft here, then review and submit on GitHub. A GitHub account is required. Submitting proposes a change; it does not publish it automatically.</p>}
                  
                  {!user ? (
                    <Card className="text-center py-12">
                      <LogIn size={48} className="mx-auto mb-4 text-neutral-grey/20" />
                      <h3 className="text-xl font-bold mb-2 uppercase text-gold-default">Authentication Required</h3>
                      <p className="text-sm text-neutral-grey mb-8 max-w-md mx-auto">Connect your terminal to access the scribe tools and submit lore proposals to the metaverse.</p>
                      <Button onClick={handleLogin} className="mx-auto">Connect Terminal</Button>
                    </Card>
                  ) : (
                    <>
                      <Card title="Lore Metadata">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label className="text-[10px] uppercase text-neutral-grey tracking-widest">Title</label>
                            <input 
                              type="text" 
                              placeholder="ENTRY TITLE..."
                              value={newLore.title}
                              onChange={(e) => setNewLore({ ...newLore, title: e.target.value })}
                              className="w-full bg-neutral-black/40 border border-neutral-grey/10 p-3 text-sm focus:outline-none focus:border-gold-default/40 uppercase text-neutral-white"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] uppercase text-neutral-grey tracking-widest">Category</label>
                            <select 
                              value={newLore.category}
                              onChange={(e) => setNewLore({ ...newLore, category: e.target.value as LoreCategory })}
                              className="w-full bg-neutral-black/40 border border-neutral-grey/10 p-3 text-sm focus:outline-none focus:border-gold-default/40 uppercase text-neutral-white"
                            >
                              {categories.map(cat => <option key={cat} value={cat} className="bg-neutral-black">{cat}</option>)}
                            </select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] uppercase text-neutral-grey tracking-widest">Image URL (Optional)</label>
                            <input 
                              type="text" 
                              placeholder="HTTPS://..."
                              value={newLore.imageUrl}
                              onChange={(e) => setNewLore({ ...newLore, imageUrl: e.target.value })}
                              className="w-full bg-neutral-black/40 border border-neutral-grey/10 p-3 text-sm focus:outline-none focus:border-gold-default/40 text-neutral-white"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] uppercase text-neutral-grey tracking-widest">Source URL (Optional)</label>
                            <input 
                              type="text" 
                              placeholder="HTTPS://..."
                              value={newLore.sourceUrl}
                              onChange={(e) => setNewLore({ ...newLore, sourceUrl: e.target.value })}
                              className="w-full bg-neutral-black/40 border border-neutral-grey/10 p-3 text-sm focus:outline-none focus:border-gold-default/40 text-neutral-white"
                            />
                          </div>
                        </div>
                      </Card>

                      <Card title="Narrative Content">
                        <div className="space-y-4">
                          <div className="flex items-center gap-4 text-[10px] uppercase text-neutral-grey border-b border-neutral-grey/10 pb-2">
                            <button className="hover:text-neutral-white transition-colors">Write</button>
                            <button className="hover:text-neutral-white transition-colors">Preview</button>
                            <span className="ml-auto">Markdown Supported</span>
                          </div>
                          <textarea 
                            placeholder="BEGIN TRANSMISSION..."
                            rows={15}
                            value={newLore.content}
                            onChange={(e) => setNewLore({ ...newLore, content: e.target.value })}
                            className="w-full bg-neutral-black/40 border border-neutral-grey/10 p-4 text-sm focus:outline-none focus:border-gold-default/40 font-mono resize-none text-neutral-white"
                          />
                          {newLore.content && (
                            <div className="pt-4 border-t border-neutral-grey/10">
                              <h4 className="text-[10px] uppercase text-neutral-grey tracking-widest mb-2 flex items-center gap-2">
                                <Cpu size={12} /> Detected Tags:
                              </h4>
                              <div className="flex flex-wrap gap-2">
                                {getTagsFromText(newLore.content).length > 0 ? (
                                  getTagsFromText(newLore.content).map(tag => (
                                    <span key={tag} className="text-[10px] px-2 py-1 bg-gold-default/10 border border-gold-default/20 text-gold-default uppercase tracking-widest">
                                      #{tag}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-[10px] text-neutral-grey italic uppercase tracking-widest">No tags detected in content...</span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </Card>

                      <div className="flex justify-end gap-4">
                        <Button variant="ghost" onClick={() => setView('home')} disabled={submitting}>Cancel</Button>
                        <Button onClick={handlePropose} disabled={submitting || !newLore.title || !newLore.content} className="px-8">
                          {submitting ? (
                            <div className="w-4 h-4 border-2 border-neutral-black border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Plus size={16} />
                          )}
                          <span className="text-xs font-bold uppercase">{submitting ? 'Transmitting...' : PAGES ? 'Review submission on GitHub' : 'Transmit to Archive'}</span>
                        </Button>
                      </div>
                    </>
                  )}
                </div>

                <aside className="w-full lg:w-80 space-y-6">
                  <Card title="Markdown Helper">
                    <div className="space-y-4 text-[10px] uppercase tracking-widest text-neutral-grey">
                      <div>
                        <p className="text-neutral-white font-bold mb-1"># Heading 1</p>
                        <p>Main Title</p>
                      </div>
                      <div>
                        <p className="text-neutral-white font-bold mb-1">## Heading 2</p>
                        <p>Section Header</p>
                      </div>
                      <div>
                        <p className="text-neutral-white font-bold mb-1">**Bold Text**</p>
                        <p>Emphasis</p>
                      </div>
                      <div>
                        <p className="text-neutral-white font-bold mb-1">* Italic Text</p>
                        <p>Subtle Emphasis</p>
                      </div>
                      <div>
                        <p className="text-neutral-white font-bold mb-1">- List Item</p>
                        <p>Bullet Points</p>
                      </div>
                      <div>
                        <p className="text-neutral-white font-bold mb-1">&gt; Blockquote</p>
                        <p>Lore Excerpts</p>
                      </div>
                    </div>
                  </Card>

                  <Card title="Scribe Guidelines">
                    <ul className="space-y-3 text-[10px] uppercase tracking-widest text-neutral-grey/60 list-disc pl-4">
                      <li>Maintain consistent tone with existing canon.</li>
                      <li>Avoid real-world political or religious references.</li>
                      <li>Ensure planetary facts align with Federation data.</li>
                      <li>Check for duplicate entries before submission.</li>
                    </ul>
                  </Card>
                </aside>
              </div>
            </motion.div>
          )}
          {view === 'profile' && profile && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-4xl mx-auto"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="md:col-span-1 space-y-6">
                  <Card className="text-center p-8">
                    <div className="w-24 h-24 rounded-full border-2 border-neutral-grey/20 overflow-hidden bg-neutral-black/40 mx-auto mb-4">
                      {user?.photoURL ? (
                        <img src={user.photoURL} alt="Avatar" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                      ) : (
                        <UserIcon size={48} className="m-auto mt-6 text-neutral-grey/20" />
                      )}
                    </div>
                    <h3 className="text-xl font-bold mb-1 uppercase tracking-tighter text-neutral-white">{profile.displayName}</h3>
                    <Badge color={profile.role === 'scribe' ? 'white' : 'gold'}>{profile.role}</Badge>
                    
                    <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-neutral-grey/10">
                      <div className="text-center">
                        <p className="text-[10px] uppercase text-neutral-grey tracking-widest mb-1">Reputation</p>
                        <p className="text-xl font-bold text-gold-default">{profile.reputation || 0}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] uppercase text-neutral-grey tracking-widest mb-1">Rank</p>
                        <p className="text-xs font-bold text-neutral-white uppercase tracking-tighter">{getRank(profile.reputation)}</p>
                      </div>
                    </div>

                    <div className="mt-8 pt-8 border-t border-neutral-grey/10 space-y-4">
                      {!profile.waxAccount && (
                        <Button 
                          onClick={handleWaxLogin} 
                          variant="secondary" 
                          className="w-full justify-center"
                        >
                          <Globe size={16} />
                          <span className="text-xs font-bold uppercase">Connect WAX Wallet</span>
                        </Button>
                      )}
                      {profile.waxAccount && (
                        <div className="p-3 bg-blue-default/5 border border-blue-default/20 rounded-md text-center">
                          <p className="text-[10px] uppercase text-neutral-grey tracking-widest mb-1">Linked WAX Account</p>
                          <p className="text-sm font-mono text-blue-default font-bold">{profile.waxAccount}</p>
                        </div>
                      )}
                      <Button 
                        onClick={() => {
                          setEditProfileData({ displayName: profile.displayName, bio: profile.bio || '' });
                          setIsEditingProfile(true);
                        }} 
                        variant="outline" 
                        className="w-full justify-center"
                      >
                        Edit Profile
                      </Button>
                      {profile.role === 'scribe' && (
                        <Button 
                          onClick={syncCanonLore} 
                          disabled={syncing} 
                          variant="primary" 
                          className="w-full justify-center"
                        >
                          {syncing ? 'Syncing...' : 'Sync Canon Sources'}
                        </Button>
                      )}
                      <Button onClick={handleLogout} variant="danger" className="w-full justify-center">
                        <LogOut size={16} />
                        <span className="text-xs font-bold uppercase">Disconnect</span>
                      </Button>
                    </div>
                  </Card>
                </div>

                <div className="md:col-span-2 space-y-8">
                  {PAGES ? <PagesStorage/> : <AccountSecurity />}
                  <Card title="Transmission Bio">
                    {isEditingProfile ? (
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase text-neutral-grey tracking-widest">Display Name</label>
                          <input 
                            type="text" 
                            value={editProfileData.displayName}
                            onChange={(e) => setEditProfileData({ ...editProfileData, displayName: e.target.value })}
                            className="w-full bg-neutral-black/40 border border-neutral-grey/10 p-2 text-sm focus:outline-none focus:border-gold-default/40 uppercase text-neutral-white"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase text-neutral-grey tracking-widest">Bio</label>
                          <textarea 
                            value={editProfileData.bio}
                            onChange={(e) => setEditProfileData({ ...editProfileData, bio: e.target.value })}
                            className="w-full bg-neutral-black/40 border border-neutral-grey/10 p-2 text-sm focus:outline-none focus:border-gold-default/40 h-32 font-mono text-neutral-white"
                            placeholder="Your bio..."
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button onClick={handleUpdateProfile}>Save Changes</Button>
                          <Button onClick={() => setIsEditingProfile(false)} variant="ghost">Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-neutral-grey leading-relaxed">
                        {profile.bio || "No bio available. Update your profile to share your story with the metaverse."}
                      </p>
                    )}
                  </Card>

                  <section>
                    <h4 className="text-[10px] uppercase text-neutral-grey tracking-widest mb-4">Bookmarked Transmissions</h4>
                    <div className="grid grid-cols-1 gap-4">
                      {lore.filter(l => profile.bookmarks?.some(id=>sourceRecordId(id)===l.id)).map(item => (
                        <Card key={item.id} title={item.category} className="hover:border-gold-default/40 transition-all cursor-pointer group" onClick={() => { setSelectedLore(item); setView('detail'); }}>
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="font-bold text-lg leading-tight group-hover:text-gold-default transition-colors">{item.title}</h4>
                            <Badge color={item.type === 'canon' ? 'white' : 'gold'}>{item.provenance === 'community-submission' && item.status === 'active' ? 'Community approved' : item.type}</Badge>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-neutral-grey uppercase">
                            <button 
                              onClick={(e) => { e.stopPropagation(); viewAuthorProfile(item.authorId); }}
                              className="hover:text-neutral-white transition-colors"
                            >
                              By {item.authorName}
                            </button>
                            <span>{item.sourceHash ? 'Pinned source edition' : new Date(item.createdAt?.seconds * 1000).toLocaleDateString()}</span>
                          </div>
                        </Card>
                      ))}
                      {(!profile.bookmarks || profile.bookmarks.length === 0) && (
                        <div className="text-center py-12 text-neutral-grey/40 uppercase tracking-widest text-[10px] border border-dashed border-neutral-grey/10">
                          No bookmarks saved
                        </div>
                      )}
                    </div>
                  </section>

                  <section>
                    <h4 className="text-[10px] uppercase text-neutral-grey tracking-widest mb-4">Following ({profile.following?.length || 0})</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      {followedProfiles.map(followed => (
                        <div 
                          key={followed.uid}
                          onClick={() => viewAuthorProfile(followed.uid)}
                          className="flex items-center gap-3 p-3 bg-neutral-white/5 border border-neutral-grey/10 hover:border-gold-default/40 transition-all cursor-pointer group"
                        >
                          <div className="w-8 h-8 rounded-full bg-neutral-black/40 border border-neutral-grey/20 overflow-hidden flex-shrink-0">
                            {followed.avatarUrl ? (
                              <img src={followed.avatarUrl} alt="Avatar" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                            ) : (
                              <UserIcon size={16} className="m-auto mt-2 text-neutral-grey/20" />
                            )}
                          </div>
                          <div className="overflow-hidden">
                            <p className="text-xs font-bold text-neutral-white truncate group-hover:text-gold-default transition-colors">{followed.displayName}</p>
                            <p className="text-[8px] uppercase text-neutral-grey tracking-widest">{followed.role}</p>
                          </div>
                        </div>
                      ))}
                      {(!profile.following || profile.following.length === 0) && (
                        <div className="col-span-full text-center py-8 text-neutral-grey/40 uppercase tracking-widest text-[10px] border border-dashed border-neutral-grey/10">
                          Not following any explorers
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              </div>
            </motion.div>
          )}
          {view === 'admin' && (
            <><Button variant="outline" className="mb-5" onClick={()=>setView('library')}>Source library & manuscript imports â†’</Button>{PAGES ? <PagesEditorial/> : <AdminDashboard currentUser={profile} onLogin={handleLogin} />}</>
          )}
        </AnimatePresence>
      </main>

      {/* --- Onboarding Overlay --- */}
      <AnimatePresence>
        {showOnboarding && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-black/90 backdrop-blur-xl p-6"
          >
            <Card className="max-w-md w-full border-gold-default/40 p-8 space-y-6">
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-gold-default/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-gold-default/20">
                  <Terminal size={32} className="text-gold-default" />
                </div>
                <h2 className="text-2xl font-black uppercase italic text-gold-default tracking-tighter">Terminal Initialization</h2>
                <p className="text-xs text-neutral-grey uppercase tracking-widest leading-relaxed">
                  Welcome, Explorer. Before accessing the Federation Archive, you must establish your digital identity.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] uppercase text-neutral-grey mb-1 block">Explorer Designation</label>
                  <input 
                    type="text" 
                    value={editProfileData.displayName}
                    onChange={(e) => setEditProfileData({...editProfileData, displayName: e.target.value})}
                    className="w-full bg-neutral-black/60 border border-neutral-grey/20 p-3 text-xs text-neutral-white focus:outline-none focus:border-gold-default"
                    placeholder="Enter your name..."
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase text-neutral-grey mb-1 block">Mission Bio</label>
                  <textarea 
                    value={editProfileData.bio}
                    onChange={(e) => setEditProfileData({...editProfileData, bio: e.target.value})}
                    className="w-full bg-neutral-black/60 border border-neutral-grey/20 p-3 text-xs text-neutral-white focus:outline-none focus:border-gold-default h-24 resize-none"
                    placeholder="Tell us about your journey..."
                  />
                </div>
              </div>

              <Button 
                onClick={async () => {
                  if (!editProfileData.displayName.trim()) return;
                  await handleUpdateProfile();
                  setShowOnboarding(false);
                }} 
                className="w-full justify-center h-12"
                disabled={!editProfileData.displayName.trim()}
              >
                <span className="text-sm font-bold uppercase">Initialize Profile</span>
              </Button>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Bottom Status --- */}
      <footer className="min-h-8 shrink-0 border-t border-neutral-grey/10 bg-neutral-black/80 flex items-center justify-between px-3 sm:px-6 text-[8px] sm:text-[10px] uppercase tracking-[0.1em] sm:tracking-[0.2em] text-neutral-grey z-50">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-success-default animate-pulse" /> Archive Terminal</span>
          
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden sm:inline">LoreWorks Â· Pass 13</span>
          <span>© 2026 LoreWorks.co.za</span>
        </div>
      </footer>

      {confirmModal && (
        <ConfirmationModal 
          isOpen={confirmModal.isOpen}
          title={confirmModal.title}
          message={confirmModal.message}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}
    </div>
  );
}
