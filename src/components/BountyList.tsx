import React from 'react';
import { Trophy, Coins, Tag } from 'lucide-react';

interface Bounty {
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
}

interface BountyListProps {
  bounties: Bounty[];
  onClaim?: (id: string) => void;
  currentUserId?: string;
}

export const BountyList: React.FC<BountyListProps> = ({ bounties, onClaim, currentUserId }) => {
  return (
    <div className="p-4 border border-zinc-800 rounded-lg bg-zinc-900/50">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 flex items-center gap-2">
          <Trophy size={14} />
          Federation Bounties
        </h3>
        <span className="px-2 py-0.5 text-[9px] font-mono bg-zinc-800 text-zinc-400 rounded uppercase tracking-tighter">Federation Requests</span>
      </div>
      <div className="space-y-3">
        {bounties.length > 0 ? (
          bounties.map((bounty) => (
            <div key={bounty.id} className="p-3 border border-zinc-800 bg-zinc-950/50 hover:border-zinc-700 transition-all group">
              <div className="flex justify-between items-start mb-2">
                <h4 className="text-xs font-bold text-zinc-200 group-hover:text-gold-default transition-colors uppercase italic">{bounty.title}</h4>
                <div className="flex items-center gap-1 text-attention-default">
                  <Coins size={10} />
                  <span className="text-[10px] font-bold">{bounty.reward}</span>
                </div>
              </div>
              <p className="text-[10px] text-zinc-500 line-clamp-2 mb-2 leading-relaxed">{bounty.description}</p>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-[9px] text-zinc-600 uppercase">
                  <Tag size={8} />
                  {bounty.category}
                </span>
                {bounty.status === 'open' && onClaim && currentUserId && (
                  <button 
                    onClick={() => onClaim(bounty.id)}
                    className="text-[9px] font-bold uppercase tracking-widest text-gold-default hover:text-gold-hover transition-colors"
                  >
                    Claim Bounty
                  </button>
                )}
                {bounty.status === 'claimed' && (
                  <div className="flex flex-col items-end">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-attention-default">
                      Claimed
                    </span>
                    {bounty.claimantWaxAccount && (
                      <span className="text-[8px] text-blue-default/60 font-mono uppercase tracking-tighter mt-0.5">
                        By {bounty.claimantWaxAccount}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          <p className="text-xs text-zinc-600 italic">No active bounties available.</p>
        )}
      </div>
    </div>
  );
};
