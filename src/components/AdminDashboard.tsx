import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Shield, 
  Users, 
  MessageSquare, 
  Plus, 
  Check, 
  X, 
  AlertCircle, 
  Trophy, 
  BookOpen,
  Search,
  Filter,
  Trash2,
  RefreshCw,
  Cpu,
  Activity,
  Globe,
  CheckCircle2,
  BarChart3,
  Eye,
  TrendingUp,
  Clock,
  Compass,
  FileText,
  Radio,
  Download,
  Flame,
  Layers
} from 'lucide-react';
import { Button, Card, Badge } from './UI';
import { LoreEntry, UserProfile, Comment, Bounty } from '../types';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  updateDoc, 
  doc, 
  addDoc, 
  serverTimestamp,
  deleteDoc,
  getDocs
} from '../services/applicationClient';
import { db } from '../services/applicationClient';
import { fetchGovernanceTelemetry, triggerCanonSync, GovernanceTelemetry } from '../services/canonService';
import { 
  fetchAnalyticsSummary, 
  fetchRecentAnalyticsEvents, 
  AnalyticsSummary, 
  LiveAnalyticsEvent 
} from '../services/analyticsService';

interface AdminDashboardProps {
  currentUser: UserProfile | null;
  onLogin?: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ currentUser, onLogin }) => {
  const [activeTab, setActiveTab] = useState<'insights' | 'submissions' | 'users' | 'comments' | 'bounties' | 'telemetry'>('insights');
  const [proposedLore, setProposedLore] = useState<LoreEntry[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [pendingComments, setPendingComments] = useState<Comment[]>([]);
  const [allBounties, setAllBounties] = useState<Bounty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reportError = (error: unknown) => setError(error instanceof Error ? error.message : 'The operation failed. Please retry.');

  // Engagement & Insights State
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [liveEvents, setLiveEvents] = useState<LiveAnalyticsEvent[]>([]);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  // Telemetry & Sync State
  const [telemetry, setTelemetry] = useState<GovernanceTelemetry | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  // Bounty Form State
  const [newBounty, setNewBounty] = useState({
    title: '',
    description: '',
    reward: '',
    category: 'General'
  });

  const loadAnalyticsData = async () => {
    setLoadingAnalytics(true);
    try {
      const [summary, events] = await Promise.all([
        fetchAnalyticsSummary(),
        fetchRecentAnalyticsEvents(30)
      ]);
      if (!summary) throw new Error('Analytics could not be loaded. Check your session and retry.');
      setAnalytics(summary);
      if (events) setLiveEvents(events);
    } catch (e) {
      reportError(e);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  useEffect(() => {
    if (currentUser?.role !== 'scribe') return;

    loadAnalyticsData();
    const analyticsInterval = setInterval(loadAnalyticsData, 15000);

    const unsubLore = onSnapshot(
      query(collection(db, 'lore'), where('type', '==', 'proposed'), where('status', '==', 'in-vote')),
      (snap) => setProposedLore(snap.docs.map(d => ({ id: d.id, ...d.data() } as LoreEntry))), reportError
    );

    const unsubComments = onSnapshot(
      query(collection(db, 'comments'), where('status', '==', 'pending')),
      (snap) => setPendingComments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Comment))), reportError
    );

    const unsubBounties = onSnapshot(
      collection(db, 'bounties'),
      (snap) => setAllBounties(snap.docs.map(d => ({ id: d.id, ...d.data() } as Bounty))), reportError
    );

    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setAllUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
      setLoading(false);
    }, (error) => { reportError(error); setLoading(false); });

    // Fetch initial telemetry
    fetchGovernanceTelemetry().then(setTelemetry);

    return () => {
      clearInterval(analyticsInterval);
      unsubLore();
      unsubComments();
      unsubBounties();
      unsubUsers();
    };
  }, [currentUser?.uid, currentUser?.role]);

  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncFeedback("Querying WAX Mainnet endpoints & GitHub Canon repository...");
    try {
      const res = await triggerCanonSync();
      if (res && res.success) {
        setSyncFeedback(`Sync completed: ${res.result?.fetched_proposals || 0} proposals, ${res.result?.fetched_events || 0} actions verified.`);
        const updated = await fetchGovernanceTelemetry();
        setTelemetry(updated);
      } else {
        setSyncFeedback("Sync cycle executed with local cached fallback.");
      }
    } catch (err: any) {
      setSyncFeedback(`Sync error: ${err.message || 'Network timeout'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleApproveLore = async (lore: LoreEntry) => {
    try {
      await updateDoc(doc(db, 'lore', lore.id), {
        status: 'active'
      });
      // Add activity
      await addDoc(collection(db, 'activity'), {
        type: 'lore_accepted',
        userId: currentUser.uid,
        userName: currentUser.displayName,
        targetId: lore.id,
        targetTitle: lore.title,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      reportError(error);
    }
  };

  const handleRejectLore = async (loreId: string) => {
    try {
      await updateDoc(doc(db, 'lore', loreId), {
        status: 'rejected'
      });
    } catch (error) {
      reportError(error);
    }
  };

  const handleApproveComment = async (commentId: string) => {
    try {
      await updateDoc(doc(db, 'comments', commentId), {
        status: 'approved'
      });
    } catch (error) {
      reportError(error);
    }
  };

  const handleRejectComment = async (commentId: string) => {
    try {
      await updateDoc(doc(db, 'comments', commentId), {
        status: 'rejected'
      });
    } catch (error) {
      reportError(error);
    }
  };

  const handleUpdateUserRole = async (userId: string, newRole: UserProfile['role']) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        role: newRole
      });
      setAllUsers(prev => prev.map(u => u.uid === userId ? { ...u, role: newRole } : u));
    } catch (error) {
      reportError(error);
    }
  };

  const handleCreateBounty = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'bounties'), {
        ...newBounty,
        status: 'open',
        authorId: currentUser.uid,
        createdAt: serverTimestamp()
      });
      setNewBounty({ title: '', description: '', reward: '', category: 'General' });
    } catch (error) {
      reportError(error);
    }
  };

  const handleDeleteBounty = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'bounties', id));
    } catch (error) {
      reportError(error);
    }
  };

  if (currentUser?.role !== 'scribe') {
    return (
      <Card title="Administration">
        <div className="space-y-4 py-6">
          <Shield size={32} className="text-gold-default" />
          <h2 className="text-xl font-bold">{currentUser ? 'Administrator access required' : 'Sign in to administer Loreworks'}</h2>
          <p className="text-sm text-neutral-grey">The Admin Terminal manages community submissions, comments, accounts, bounties, analytics and source refresh. Only accounts with Scribe clearance can use these controls.</p>
          {currentUser ? <p className="text-sm">Signed in as <strong>{currentUser.displayName}</strong> with {currentUser.role} clearance. Ask the site operator to authorize this account.</p> : onLogin && <Button onClick={onLogin}>Sign in</Button>}
          <details className="text-sm border border-neutral-grey/20 rounded p-4">
            <summary className="cursor-pointer text-gold-default">First administrator setup - site operator</summary>
            <p className="mt-3">For separately authorized administrators, the site operator can assign an existing Loreworks account on the host. Stop the application and use the same application data directory, then run:</p>
            <code className="block my-3 break-all">npm run account:admin -- EXACT_USERNAME scribe</code>
            <p>Use the exact existing username or verified wallet account. Restart the server and sign in again. This requires server access; connecting a wallet alone never grants administrator privileges.</p>
          </details>
        </div>
      </Card>
    );
  }

  return (
    <div id="admin-dashboard-container" className="max-w-6xl mx-auto space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-4xl font-black tracking-tighter uppercase italic text-gold-default terminal-text-glow">Admin Terminal</h2>
          <p className="text-xs text-neutral-grey uppercase tracking-[0.2em]">Federation Oversight & Moderation</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(['insights', 'submissions', 'users', 'comments', 'bounties', 'telemetry'] as const).map(tab => (
            <Button 
              key={tab}
              id={`tab-admin-${tab}`}
              aria-pressed={activeTab === tab}
              variant={activeTab === tab ? 'primary' : 'outline'}
              onClick={() => setActiveTab(tab)}
              className="text-[10px] uppercase tracking-widest gap-1.5"
            >
              {tab === 'insights' && <BarChart3 size={12} />}
              {tab === 'submissions' && <BookOpen size={12} />}
              {tab === 'users' && <Users size={12} />}
              {tab === 'comments' && <MessageSquare size={12} />}
              {tab === 'bounties' && <Trophy size={12} />}
              {tab === 'telemetry' && <Radio size={12} />}
              <span>{tab}</span>
            </Button>
          ))}
        </div>
      </div>

      {error && <div role="alert" className="border border-error-default/40 p-4 rounded text-sm flex gap-3 items-start"><span className="flex-1">{error}</span><button aria-label="Dismiss error" onClick={() => setError(null)}><X size={16} /></button></div>}
      {loading && <p role="status" className="text-sm text-neutral-grey">Loading administration records...</p>}
      <p className="text-xs text-neutral-grey">Community approval publishes a community submission; authoritative canon remains tied to its verified sources. Role changes revoke the affected account's sessions.</p>
      <div className="grid grid-cols-1 gap-8">
        {activeTab === 'insights' && (
          <div className="space-y-6">
            {/* Insights Header Banner */}
            <div className="p-6 bg-gradient-to-r from-neutral-black/80 via-neutral-black/90 to-neutral-black/80 border border-neutral-grey/10 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-xl font-black uppercase italic text-neutral-white flex items-center gap-2">
                    <BarChart3 className="text-gold-default" size={20} />
                    Platform Engagement & Interaction Insights
                  </h3>
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-mono text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    LIVE TELEMETRY
                  </span>
                </div>
                <p className="text-xs text-neutral-grey">
                  Real-time analytics across explorer sessions, planetary dossier inspections, lore chapter reads, and governance participation.
                </p>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadAnalyticsData}
                  disabled={loadingAnalytics}
                  className="text-xs gap-1.5 border-neutral-grey/20 text-neutral-white"
                >
                  <RefreshCw size={13} className={loadingAnalytics ? "animate-spin" : ""} />
                  <span>Refresh</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(analytics || {}, null, 2));
                    const downloadAnchor = document.createElement('a');
                    downloadAnchor.setAttribute("href", dataStr);
                    downloadAnchor.setAttribute("download", `alien_worlds_analytics_${new Date().toISOString().split('T')[0]}.json`);
                    document.body.appendChild(downloadAnchor);
                    downloadAnchor.click();
                    downloadAnchor.remove();
                  }}
                  className="text-xs gap-1.5 border-gold-default/30 text-gold-default hover:bg-gold-default/10"
                >
                  <Download size={13} />
                  <span>Export Report</span>
                </Button>
              </div>
            </div>

            {/* KPI Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="p-4 bg-neutral-black/60 border border-neutral-grey/10 rounded-lg">
                <div className="flex items-center justify-between text-neutral-grey mb-1">
                  <span className="text-[10px] uppercase font-mono tracking-wider">Total Impressions</span>
                  <Eye size={14} className="text-gold-default" />
                </div>
                <div className="text-2xl font-black font-mono text-neutral-white">
                  {analytics?.overview.totalPageViews || 0}
                </div>
                <span className="text-[9px] text-neutral-grey flex items-center gap-1 mt-1">
                  <span className="text-emerald-400 font-bold">+{analytics?.overview.pageViews24h || 0}</span> in last 24h
                </span>
              </div>

              <div className="p-4 bg-neutral-black/60 border border-neutral-grey/10 rounded-lg">
                <div className="flex items-center justify-between text-neutral-grey mb-1">
                  <span className="text-[10px] uppercase font-mono tracking-wider">Unique Sessions</span>
                  <Users size={14} className="text-blue-400" />
                </div>
                <div className="text-2xl font-black font-mono text-neutral-white">
                  {analytics?.overview.uniqueSessions || 0}
                </div>
                <span className="text-[9px] text-neutral-grey flex items-center gap-1 mt-1">
                  Explorers identified
                </span>
              </div>

              <div className="p-4 bg-neutral-black/60 border border-neutral-grey/10 rounded-lg">
                <div className="flex items-center justify-between text-neutral-grey mb-1">
                  <span className="text-[10px] uppercase font-mono tracking-wider">Transmissions Read</span>
                  <BookOpen size={14} className="text-purple-400" />
                </div>
                <div className="text-2xl font-black font-mono text-neutral-white">
                  {analytics?.overview.totalLoreReads || 0}
                </div>
                <span className="text-[9px] text-neutral-grey flex items-center gap-1 mt-1">
                  Chapters opened
                </span>
              </div>

              <div className="p-4 bg-neutral-black/60 border border-neutral-grey/10 rounded-lg">
                <div className="flex items-center justify-between text-neutral-grey mb-1">
                  <span className="text-[10px] uppercase font-mono tracking-wider">Reading Time</span>
                  <Clock size={14} className="text-amber-400" />
                </div>
                <div className="text-2xl font-black font-mono text-neutral-white">
                  {analytics?.overview.totalLoreDurationMinutes || 0}<span className="text-xs font-normal text-neutral-grey">m</span>
                </div>
                <span className="text-[9px] text-neutral-grey flex items-center gap-1 mt-1">
                  Cumulative dwell
                </span>
              </div>

              <div className="p-4 bg-neutral-black/60 border border-neutral-grey/10 rounded-lg">
                <div className="flex items-center justify-between text-neutral-grey mb-1">
                  <span className="text-[10px] uppercase font-mono tracking-wider">Interactions</span>
                  <Flame size={14} className="text-rose-400" />
                </div>
                <div className="text-2xl font-black font-mono text-neutral-white">
                  {analytics?.overview.totalInteractions || 0}
                </div>
                <span className="text-[9px] text-neutral-grey flex items-center gap-1 mt-1">
                  Votes, comments, bounties
                </span>
              </div>

              <div className="p-4 bg-neutral-black/60 border border-neutral-grey/10 rounded-lg">
                <div className="flex items-center justify-between text-neutral-grey mb-1">
                  <span className="text-[10px] uppercase font-mono tracking-wider">Engagement Depth</span>
                  <TrendingUp size={14} className="text-emerald-400" />
                </div>
                <div className="text-2xl font-black font-mono text-neutral-white">
                  {analytics?.overview.retentionRatePct || 0}%
                </div>
                <span className="text-[9px] text-neutral-grey flex items-center gap-1 mt-1">
                  Multi-page depth ratio
                </span>
              </div>
            </div>

            {/* Split Grid: Planetary Interest & Platform Section Traffic */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Planetary Dossier Invasions */}
              <Card title="Planetary Dossier Invasions & Explorer Interest">
                <p className="text-xs text-neutral-grey mb-4">
                  Distribution of planetary archive dossier inspections across all known Federation and unaligned worlds.
                </p>
                {analytics && analytics.topPlanets && analytics.topPlanets.length > 0 ? (
                  <div className="space-y-3">
                    {analytics.topPlanets.map((item, idx) => {
                      const totalVisits = analytics.topPlanets.reduce((acc, p) => acc + p.visits, 0) || 1;
                      const pct = Math.round((item.visits / totalVisits) * 100);
                      return (
                        <div key={item.planet} className="space-y-1">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-neutral-white flex items-center gap-1.5">
                              <span className="w-4 text-[10px] font-mono text-neutral-grey">{idx + 1}.</span>
                              <Globe size={13} className="text-gold-default" />
                              {item.planet}
                            </span>
                            <span className="font-mono text-neutral-grey">
                              <span className="text-neutral-white font-bold">{item.visits}</span> visits ({pct}%)
                            </span>
                          </div>
                          <div className="w-full bg-neutral-black/60 h-2 rounded-full overflow-hidden border border-neutral-grey/10">
                            <div 
                              className="h-full bg-gradient-to-r from-gold-default/60 to-gold-default rounded-full transition-all duration-500"
                              style={{ width: `${Math.max(4, pct)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-neutral-grey">
                    <Compass size={24} className="mx-auto mb-2 opacity-40 text-gold-default" />
                    Explorer planetary telemetry accumulating in real-time as users navigate worlds.
                  </div>
                )}
              </Card>

              {/* Platform Sections & Route Usage */}
              <Card title="Platform Section Navigation Frequency">
                <p className="text-xs text-neutral-grey mb-4">
                  Navigation breakdown across platform modules (Atlas Knowledge Graph, Canon Database, Proposals, Reader).
                </p>
                {analytics && analytics.topRoutes && analytics.topRoutes.length > 0 ? (
                  <div className="space-y-3">
                    {analytics.topRoutes.map((route) => {
                      const totalRouteViews = analytics.topRoutes.reduce((acc, r) => acc + r.count, 0) || 1;
                      const pct = Math.round((route.count / totalRouteViews) * 100);
                      return (
                        <div key={route.view} className="space-y-1">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-neutral-white flex items-center gap-1.5 uppercase tracking-wide">
                              <Layers size={13} className="text-blue-400" />
                              {route.view.replace('/', '') || 'Home / Terminal'}
                            </span>
                            <span className="font-mono text-neutral-grey">
                              <span className="text-neutral-white font-bold">{route.count}</span> views ({pct}%)
                            </span>
                          </div>
                          <div className="w-full bg-neutral-black/60 h-2 rounded-full overflow-hidden border border-neutral-grey/10">
                            <div 
                              className="h-full bg-gradient-to-r from-blue-500/60 to-blue-400 rounded-full transition-all duration-500"
                              style={{ width: `${Math.max(4, pct)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-neutral-grey">
                    <Activity size={24} className="mx-auto mb-2 opacity-40 text-blue-400" />
                    Section impressions stream updating dynamically.
                  </div>
                )}
              </Card>
            </div>

            {/* Top Transmissions & Dwell Time Leaderboard */}
            <Card title="Most Read Transmissions & Lore Chapters">
              <p className="text-xs text-neutral-grey mb-4">
                Telemetry on reader engagement, chapter completions, and average attention dwell time.
              </p>
              {analytics && analytics.topLoreEntries && analytics.topLoreEntries.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-neutral-grey/10 text-[10px] uppercase font-mono text-neutral-grey">
                        <th className="pb-2">Transmission Title</th>
                        <th className="pb-2">Lore ID</th>
                        <th className="pb-2 text-right">Reads</th>
                        <th className="pb-2 text-right">Avg Dwell</th>
                        <th className="pb-2 text-right">Engagement</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-grey/5">
                      {analytics.topLoreEntries.map((lore, idx) => (
                        <tr key={lore.loreId || idx} className="hover:bg-neutral-white/[0.02] transition-colors">
                          <td className="py-2.5 font-bold text-neutral-white flex items-center gap-2">
                            <FileText size={13} className="text-purple-400 shrink-0" />
                            <span className="truncate max-w-[240px]">{lore.title}</span>
                          </td>
                          <td className="py-2.5 font-mono text-[10px] text-neutral-grey">{lore.loreId}</td>
                          <td className="py-2.5 text-right font-mono font-bold text-neutral-white">{lore.reads}</td>
                          <td className="py-2.5 text-right font-mono text-amber-400">{lore.avgDwellSeconds}s</td>
                          <td className="py-2.5 text-right">
                            <Badge color={lore.reads > 5 ? "gold" : "blue"}>
                              {lore.reads > 5 ? "High Interest" : "Active"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-neutral-grey">
                  <BookOpen size={24} className="mx-auto mb-2 opacity-40 text-purple-400" />
                  Lore dwell telemetry updates as readers scroll and inspect archive records.
                </div>
              )}
            </Card>

            {/* Real-time Live Interaction & Event Stream */}
            <Card title="Live Interaction & Activity Telemetry Stream">
              <div className="flex justify-between items-center mb-4">
                <p className="text-xs text-neutral-grey">
                  Real-time event feed capturing page visits, planet switches, lore reads, votes, and searches.
                </p>
                <span className="text-[10px] font-mono text-neutral-grey">
                  Showing latest {liveEvents.length} events
                </span>
              </div>
              {liveEvents.length > 0 ? (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {liveEvents.map((evt) => (
                    <div 
                      key={evt.id} 
                      className="p-2.5 bg-neutral-black/50 border border-neutral-grey/10 rounded flex items-center justify-between gap-3 text-xs hover:border-gold-default/20 transition-all font-mono"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold ${
                          evt.event_type === 'page_view' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                          evt.event_type === 'lore_read' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                          evt.event_type === 'planet_view' ? 'bg-gold-default/10 text-gold-default border border-gold-default/20' :
                          'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        }`}>
                          {evt.event_type.replace('_', ' ')}
                        </span>
                        <span className="text-neutral-white truncate">
                          {evt.lore_title || evt.planet || evt.path || 'Platform Event'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-neutral-grey shrink-0">
                        {evt.session_id && (
                          <span className="opacity-60 hidden sm:inline">{evt.session_id.substring(0, 10)}...</span>
                        )}
                        <span>{new Date(evt.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-neutral-grey font-mono">
                  No event records logged in current window. Telemetry listening...
                </div>
              )}
            </Card>
          </div>
        )}

        {activeTab === 'submissions' && (
          <Card title="Proposed Lore Submissions">
            <div className="space-y-4">
              {proposedLore.length > 0 ? proposedLore.map(lore => (
                <div key={lore.id} className="p-4 border border-neutral-grey/10 bg-neutral-black/40 rounded-lg flex items-center justify-between group hover:border-gold-default/20 transition-all">
                  <div className="flex-1 min-w-0 mr-4">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-bold uppercase italic text-sm text-neutral-white truncate">{lore.title}</h4>
                      <Badge color="gold">{lore.category}</Badge>
                    </div>
                    <p className="text-[10px] text-neutral-grey line-clamp-1 mb-2">{lore.content}</p>
                    <div className="flex items-center gap-4 text-[8px] uppercase tracking-widest text-neutral-grey/60">
                      <span>Author: {lore.authorName}</span>
                      <span>Votes: {lore.voteCount}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="text-success-default hover:bg-success-default/10" aria-label="Approve community submission" title="Approve community submission" onClick={() => handleApproveLore(lore)}>
                      <Check size={14} />
                    </Button>
                    <Button size="sm" variant="outline" className="text-error-default hover:bg-error-default/10" aria-label="Reject community submission" title="Reject community submission" onClick={() => handleRejectLore(lore.id)}>
                      <X size={14} />
                    </Button>
                  </div>
                </div>
              )) : (
                <p className="text-center py-8 text-xs text-neutral-grey uppercase tracking-widest italic">No pending submissions</p>
              )}
            </div>
          </Card>
        )}

        {activeTab === 'comments' && (
          <Card title="Comment Moderation Queue">
            <div className="space-y-4">
              {pendingComments.length > 0 ? pendingComments.map(comment => (
                <div key={comment.id} className="p-4 border border-neutral-grey/10 bg-neutral-black/40 rounded-lg flex items-center justify-between group hover:border-gold-default/20 transition-all">
                  <div className="flex-1 min-w-0 mr-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-xs text-blue-default">{comment.userName}</span>
                      <span className="text-[8px] text-neutral-grey uppercase tracking-widest">on Lore ID: {comment.loreEntryId}</span>
                    </div>
                    <p className="text-xs text-neutral-white italic">"{comment.text}"</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="text-success-default hover:bg-success-default/10" aria-label="Approve comment" title="Approve comment" onClick={() => handleApproveComment(comment.id)}>
                      <Check size={14} />
                    </Button>
                    <Button size="sm" variant="outline" className="text-error-default hover:bg-error-default/10" aria-label="Reject comment" title="Reject comment" onClick={() => handleRejectComment(comment.id)}>
                      <X size={14} />
                    </Button>
                  </div>
                </div>
              )) : (
                <p className="text-center py-8 text-xs text-neutral-grey uppercase tracking-widest italic">No comments awaiting review</p>
              )}
            </div>
          </Card>
        )}

        {activeTab === 'users' && (
          <Card title="Federation Personnel Management">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-neutral-grey/10">
                    <th className="py-4 px-4 text-[10px] uppercase tracking-widest text-neutral-grey">User</th>
                    <th className="py-4 px-4 text-[10px] uppercase tracking-widest text-neutral-grey">Role</th>
                    <th className="py-4 px-4 text-[10px] uppercase tracking-widest text-neutral-grey">WAX Account</th>
                    <th className="py-4 px-4 text-[10px] uppercase tracking-widest text-neutral-grey">Reputation</th>
                    <th className="py-4 px-4 text-[10px] uppercase tracking-widest text-neutral-grey">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allUsers.map(u => (
                    <tr key={u.uid} className="border-b border-neutral-grey/5 hover:bg-neutral-white/5 transition-colors">
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-neutral-white/10 rounded flex items-center justify-center text-xs font-bold">
                            {u.displayName[0]}
                          </div>
                          <span className="text-xs font-bold text-neutral-white">{u.displayName}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <select 
                          aria-label={`Role for ${u.displayName}`}
                          disabled={u.uid === currentUser.uid}
                          value={u.role} 
                          onChange={(e) => handleUpdateUserRole(u.uid, e.target.value as any)}
                          className="bg-neutral-black/60 border border-neutral-grey/20 text-[10px] uppercase tracking-widest text-gold-default p-1 rounded focus:outline-none focus:border-gold-default"
                        >
                          <option value="reader">Reader</option>
                          <option value="skiv">Skiv</option>
                          <option value="skribus">Skribus</option>
                          <option value="scribe">Scribe (administrator)</option>
                        </select>
                      </td>
                      <td className="py-4 px-4">
                        <span className="text-[10px] font-mono text-blue-default">{u.waxAccount || 'N/A'}</span>
                      </td>
                      <td className="py-4 px-4">
                        <span className="text-xs text-neutral-grey">{u.reputation || 0}</span>
                      </td>
                      <td className="py-4 px-4">
                        <span className="text-xs text-neutral-grey">{u.uid === currentUser.uid ? 'Your account' : 'Use role selector'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {activeTab === 'bounties' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
              <Card title="Post New Bounty">
                <form onSubmit={handleCreateBounty} className="space-y-4">
                  <div>
                    <label className="text-[10px] uppercase text-neutral-grey mb-1 block">Title</label>
                    <input 
                      type="text" 
                      value={newBounty.title}
                      onChange={(e) => setNewBounty({...newBounty, title: e.target.value})}
                      className="w-full bg-neutral-black/60 border border-neutral-grey/20 p-2 text-xs text-neutral-white focus:outline-none focus:border-gold-default"
                      placeholder="e.g. Map the Neri Moons"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-neutral-grey mb-1 block">Reward</label>
                    <input 
                      type="text" 
                      value={newBounty.reward}
                      onChange={(e) => setNewBounty({...newBounty, reward: e.target.value})}
                      className="w-full bg-neutral-black/60 border border-neutral-grey/20 p-2 text-xs text-neutral-white focus:outline-none focus:border-gold-default"
                      placeholder="e.g. 500 Trilium"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-neutral-grey mb-1 block">Category</label>
                    <select 
                      value={newBounty.category}
                      onChange={(e) => setNewBounty({...newBounty, category: e.target.value})}
                      className="w-full bg-neutral-black/60 border border-neutral-grey/20 p-2 text-xs text-neutral-white focus:outline-none focus:border-gold-default uppercase tracking-widest"
                    >
                      <option value="General">General</option>
                      <option value="Exploration">Exploration</option>
                      <option value="Technical">Technical</option>
                      <option value="Narrative">Narrative</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-neutral-grey mb-1 block">Description</label>
                    <textarea 
                      value={newBounty.description}
                      onChange={(e) => setNewBounty({...newBounty, description: e.target.value})}
                      className="w-full bg-neutral-black/60 border border-neutral-grey/20 p-2 text-xs text-neutral-white focus:outline-none focus:border-gold-default h-24 resize-none"
                      placeholder="Detailed mission brief..."
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full justify-center">
                    <Plus size={16} />
                    <span className="text-xs font-bold uppercase">Authorize Bounty</span>
                  </Button>
                </form>
              </Card>
            </div>
            <div className="lg:col-span-2">
              <Card title="Active Bounties">
                <div className="space-y-4">
                  {allBounties.map(bounty => (
                    <div key={bounty.id} className="p-4 border border-neutral-grey/10 bg-neutral-black/40 rounded-lg flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-bold uppercase italic text-sm text-neutral-white">{bounty.title}</h4>
                          <Badge color={bounty.status === 'open' ? 'gold' : 'blue'}>{bounty.status}</Badge>
                        </div>
                        <p className="text-[10px] text-neutral-grey mb-2">{bounty.description}</p>
                        <div className="flex items-center gap-4 text-[8px] uppercase tracking-widest text-neutral-grey/60">
                          <span className="flex items-center gap-1"><Trophy size={8} className="text-gold-default" /> {bounty.reward}</span>
                          <span>Category: {bounty.category}</span>
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" className="text-error-default" onClick={() => handleDeleteBounty(bounty.id)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        )}

        {activeTab === 'telemetry' && (
          <div className="space-y-6">
            <Card title="Canon Ingestion Daemon & Telemetry">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-neutral-grey/10">
                <div>
                  <h3 className="text-lg font-bold uppercase italic text-neutral-white">WAX Hyperion & GitHub Ingestion Engine</h3>
                  <p className="text-xs text-neutral-grey">Multi-node resilient polling daemon for Alien Worlds lore and governance actions</p>
                </div>
                <Button 
                  onClick={handleManualSync}
                  disabled={isSyncing}
                  className="gap-2 bg-gold-default text-black hover:bg-gold-hover"
                >
                  <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
                  <span>{isSyncing ? "Executing Sync..." : "Trigger Manual Sync"}</span>
                </Button>
              </div>

              {syncFeedback && (
                <div className="p-3 my-4 rounded bg-gold-default/10 border border-gold-default/30 text-xs text-gold-default font-mono">
                  {syncFeedback}
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
                <div className="p-3 bg-neutral-black/60 border border-neutral-grey/10 rounded">
                  <span className="text-[10px] uppercase text-neutral-grey block">Target Chain</span>
                  <span className="text-sm font-mono font-bold text-neutral-white">{telemetry?.chain || 'WAX Mainnet'}</span>
                </div>
                <div className="p-3 bg-neutral-black/60 border border-neutral-grey/10 rounded">
                  <span className="text-[10px] uppercase text-neutral-grey block">Contract</span>
                  <span className="text-sm font-mono font-bold text-blue-400">{telemetry?.contract || 'lore.worlds'}</span>
                </div>
                <div className="p-3 bg-neutral-black/60 border border-neutral-grey/10 rounded">
                  <span className="text-[10px] uppercase text-neutral-grey block">Engine Status</span>
                  <span className="text-sm font-bold text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 size={12} /> {telemetry?.status || 'Unknown'}
                  </span>
                </div>
                <div className="p-3 bg-neutral-black/60 border border-neutral-grey/10 rounded">
                  <span className="text-[10px] uppercase text-neutral-grey block">Pass Rate</span>
                  <span className="text-sm font-bold text-gold-default">{telemetry?.pass_rate_pct || 0}%</span>
                </div>
              </div>

              <div className="mt-6 space-y-2">
                <h4 className="text-xs font-mono uppercase tracking-widest text-neutral-grey">Configured History Endpoints</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono text-neutral-grey">
                  <div className="p-2 bg-neutral-white/[0.02] border border-neutral-grey/10 rounded flex justify-between">
                    <span>api.waxsweden.org</span>
                    <span className="text-emerald-400">NOT PROBED</span>
                  </div>
                  <div className="p-2 bg-neutral-white/[0.02] border border-neutral-grey/10 rounded flex justify-between">
                    <span>wax.eu.eosamsterdam.net</span>
                    <span className="text-emerald-400">NOT PROBED</span>
                  </div>
                  <div className="p-2 bg-neutral-white/[0.02] border border-neutral-grey/10 rounded flex justify-between">
                    <span>wax.eosusa.news</span>
                    <span className="text-emerald-400">NOT PROBED</span>
                  </div>
                  <div className="p-2 bg-neutral-white/[0.02] border border-neutral-grey/10 rounded flex justify-between">
                    <span>hyperion.wax.blacklusion.io</span>
                    <span className="text-emerald-400">NOT PROBED</span>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

