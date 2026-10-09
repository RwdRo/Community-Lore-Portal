import React, { useState, useEffect } from 'react';
import { Activity, MessageSquare, BookOpen, Trophy, CheckCircle, Globe, Shield, ExternalLink, Radio } from 'lucide-react';
import { fetchHyperionEvents, HyperionActionItem } from '../services/canonService';

interface ActivityLog {
  id: string;
  type: 'new_lore' | 'new_comment' | 'lore_accepted' | 'new_bounty' | 'follow' | 'bounty_claimed';
  userId: string;
  userName: string;
  waxAccount?: string;
  targetId?: string;
  targetTitle?: string;
  createdAt: any;
}

interface ActivityFeedProps {
  activities: ActivityLog[];
}

export const ActivityFeed: React.FC<ActivityFeedProps> = ({ activities }) => {
  const [filter, setFilter] = useState<'all' | 'community' | 'hyperion'>('all');
  const [hyperionEvents, setHyperionEvents] = useState<HyperionActionItem[]>([]);
  const [loadingHyperion, setLoadingHyperion] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setLoadingHyperion(true);
    fetchHyperionEvents(20)
      .then((events) => {
        if (isMounted) {
          setHyperionEvents(events);
        }
      })
      .finally(() => {
        if (isMounted) setLoadingHyperion(false);
      });

    const interval = setInterval(() => {
      fetchHyperionEvents(20).then((events) => {
        if (isMounted && events.length > 0) setHyperionEvents(events);
      });
    }, 30000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const getCommunityIcon = (type: string) => {
    switch (type) {
      case 'new_lore': return <BookOpen size={13} className="text-blue-400" />;
      case 'new_comment': return <MessageSquare size={13} className="text-gold-default" />;
      case 'lore_accepted': return <CheckCircle size={13} className="text-success-default" />;
      case 'new_bounty': return <Trophy size={13} className="text-yellow-400" />;
      case 'bounty_claimed': return <Trophy size={13} className="text-emerald-400" />;
      default: return <Activity size={13} className="text-neutral-grey" />;
    }
  };

  const getCommunityMessage = (activity: ActivityLog) => {
    switch (activity.type) {
      case 'new_lore': return `proposed new transmission: "${activity.targetTitle}"`;
      case 'new_comment': return `commented on "${activity.targetTitle}"`;
      case 'lore_accepted': return `lore accepted to canon: "${activity.targetTitle}"`;
      case 'new_bounty': return `authorized bounty: "${activity.targetTitle}"`;
      case 'bounty_claimed': return `claimed bounty: "${activity.targetTitle}"`;
      case 'follow': return `tuned into a new Scribe`;
      default: return 'performed an archive action';
    }
  };

  const getHyperionActionBadge = (actionName: string) => {
    switch (actionName) {
      case 'proposelore':
      case 'propose':
        return <span className="text-[8px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-1 py-0.2 rounded font-mono">PROPOSE</span>;
      case 'votelore':
      case 'vote':
        return <span className="text-[8px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1 py-0.2 rounded font-mono">VOTE</span>;
      case 'acceptlore':
      case 'pass':
        return <span className="text-[8px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1 py-0.2 rounded font-mono">CANON</span>;
      default:
        return <span className="text-[8px] bg-neutral-white/10 text-neutral-grey border border-neutral-grey/20 px-1 py-0.2 rounded font-mono">{actionName}</span>;
    }
  };

  const totalItems = filter === 'community' 
    ? activities.length 
    : filter === 'hyperion' 
    ? hyperionEvents.length 
    : activities.length + hyperionEvents.length;

  return (
    <div id="federation-activity-feed" className="p-4 border border-neutral-grey/15 rounded-lg bg-neutral-black/60 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-3 border-b border-neutral-grey/10 pb-2.5">
        <div className="flex items-center gap-2">
          <Radio size={14} className="text-gold-default animate-pulse" />
          <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-white font-bold">
            Telemetry Feed
          </h3>
        </div>
        <div className="flex gap-1 bg-neutral-black/80 p-0.5 rounded border border-neutral-grey/20">
          <button
            id="tab-feed-all"
            onClick={() => setFilter('all')}
            className={`text-[8px] uppercase tracking-wider px-2 py-0.5 rounded transition-all ${filter === 'all' ? 'bg-gold-default text-black font-bold' : 'text-neutral-grey hover:text-white'}`}
          >
            All
          </button>
          <button
            id="tab-feed-hyperion"
            onClick={() => setFilter('hyperion')}
            className={`text-[8px] uppercase tracking-wider px-2 py-0.5 rounded transition-all ${filter === 'hyperion' ? 'bg-blue-500 text-white font-bold' : 'text-neutral-grey hover:text-white'}`}
          >
            On-Chain
          </button>
          <button
            id="tab-feed-community"
            onClick={() => setFilter('community')}
            className={`text-[8px] uppercase tracking-wider px-2 py-0.5 rounded transition-all ${filter === 'community' ? 'bg-gold-default text-black font-bold' : 'text-neutral-grey hover:text-white'}`}
          >
            Scribes
          </button>
        </div>
      </div>

      <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1 custom-scrollbar">
        {/* On-Chain Hyperion Actions */}
        {(filter === 'all' || filter === 'hyperion') && hyperionEvents.map((event) => (
          <div key={`hyp-${event.id}`} className="p-2.5 rounded bg-blue-950/10 border border-blue-500/15 hover:border-blue-400/30 transition-all flex items-start gap-2.5">
            <Globe size={13} className="text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-[10px] font-mono font-bold text-blue-300 truncate">
                  {event.actor}
                </span>
                {getHyperionActionBadge(event.action_name)}
              </div>
              <p className="text-[10px] text-neutral-grey leading-tight truncate">
                {event.data?.title || event.data?.memo || `Action on lore.worlds`}
              </p>
              <div className="flex items-center justify-between mt-1 pt-1 border-t border-blue-500/10 text-[8px] text-neutral-grey/70 font-mono">
                <span>Block #{event.block_num}</span>
                <a
                  href={`https://waxblock.io/transaction/${event.trx_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline flex items-center gap-0.5"
                  title="View on WAX Block Explorer"
                >
                  <span>tx:{event.trx_id.slice(0, 6)}...</span>
                  <ExternalLink size={8} />
                </a>
              </div>
            </div>
          </div>
        ))}

        {/* Community application Activities */}
        {(filter === 'all' || filter === 'community') && activities.map((activity) => (
          <div key={`act-${activity.id}`} className="p-2.5 rounded bg-neutral-white/[0.02] border border-neutral-grey/10 hover:border-gold-default/20 transition-all flex items-start gap-2.5">
            <div className="mt-0.5 flex-shrink-0">{getCommunityIcon(activity.type)}</div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-neutral-white leading-tight">
                <span className="font-bold text-gold-default">{activity.userName}</span>{' '}
                <span className="text-neutral-grey">{getCommunityMessage(activity)}</span>
              </p>
              {activity.waxAccount && (
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-[8px] text-blue-400/80 font-mono uppercase bg-blue-500/10 px-1 rounded">
                    {activity.waxAccount}
                  </span>
                </div>
              )}
              <p className="text-[8px] text-neutral-grey/50 uppercase mt-1">
                {activity.createdAt?.seconds ? new Date(activity.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent'}
              </p>
            </div>
          </div>
        ))}

        {totalItems === 0 && (
          <div className="py-8 text-center text-neutral-grey/50 text-[10px] uppercase tracking-widest italic">
            {loadingHyperion ? 'Receiving telemetry packet...' : 'No telemetry transmissions logged.'}
          </div>
        )}
      </div>
    </div>
  );
};

