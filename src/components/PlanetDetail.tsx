import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { 
  ChevronLeft, 
  Globe, 
  Shield, 
  User, 
  ThumbsUp, 
  BookOpen, 
  ExternalLink, 
  Activity, 
  Users, 
  FileCheck,
  Compass,
  Layers,
  Sparkles,
  Radio,
  ArrowRight,
  Flame,
  Snowflake,
  Wind,
  Droplets,
  Trees,
  Mountain
} from 'lucide-react';
import { Button, Card, Badge } from './UI';
import { LoreEntry } from '../types';
import { fetchPlanetaryMetrics, PlanetaryMetric } from '../services/canonService';
import { getSystemById, isLoreForPlanet, isLoreReferenceForPlanet } from '../constants/planetLoreMapping';

interface PlanetDetailProps {
  planetName: string;
  lore: LoreEntry[];
  onBack: () => void;
  onLoreClick: (entry: LoreEntry) => void;
}

export const PlanetDetail: React.FC<PlanetDetailProps> = ({ planetName, lore, onBack, onLoreClick }) => {
  const normalizedPlanet = planetName.toLowerCase().trim();
  const systemInfo = getSystemById(normalizedPlanet) || {
    id: normalizedPlanet,
    name: planetName,
    classification: 'Documented World' as const,
    type: 'Archive world',
    climate: 'Not specified in indexed canon',
    gravity: 'Not specified in indexed canon',
    atmosphere: 'Not specified in indexed canon',
    dominantResource: 'Not specified in indexed canon',
    governingFaction: 'Not specified in indexed canon',
    residentSpecies: [],
    coordinates: { ra: 'Not indexed', dec: 'Not indexed', distance: 'Not indexed', sectorGrid: 'Archive index' },
    image: '',
    description: `Archive index for ${planetName}.`,
    keyLoreThemes: []
  };

  const [planetMetric, setPlanetMetric] = useState<PlanetaryMetric | null>(null);

  useEffect(() => {
    fetchPlanetaryMetrics().then((metrics) => {
      const match = metrics.find(
        (m) => m.planet_id.toLowerCase() === normalizedPlanet || m.planet_name.toLowerCase() === normalizedPlanet
      );
      if (match) setPlanetMetric(match);
    });
  }, [normalizedPlanet]);

  // Accurately filter verified lore belonging to this specific planetary system
  const relatedLore = useMemo(() => {
    return lore.filter(entry => isLoreForPlanet(entry, normalizedPlanet));
  }, [lore, normalizedPlanet]);

  const canonLore = useMemo(() => relatedLore.filter(l => l.type === 'canon'), [relatedLore]);
  const proposedLore = useMemo(() => relatedLore.filter(l => l.type === 'proposed'), [relatedLore]);
  const referencedLore = useMemo(() => lore.filter(entry => isLoreReferenceForPlanet(entry, normalizedPlanet)), [lore, normalizedPlanet]);

  const getBiomeIcon = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('magor')) return <Flame className="text-amber-500" size={16} />;
    if (n.includes('kavian')) return <Snowflake className="text-cyan-400" size={16} />;
    if (n.includes('naron')) return <Wind className="text-emerald-400" size={16} />;
    if (n.includes('neri')) return <Compass className="text-yellow-400" size={16} />;
    if (n.includes('veles')) return <Droplets className="text-teal-400" size={16} />;
    if (n.includes('eyeke')) return <Trees className="text-green-400" size={16} />;
    if (n.includes('alta')) return <Sparkles className="text-gold-default" size={16} />;
    if (n.includes('khaur')) return <Mountain className="text-rose-400" size={16} />;
    if (n.includes('velgemmis')) return <Trees className="text-emerald-300" size={16} />;
    if (n.includes('lopat')) return <Radio className="text-sky-400" size={16} />;
    return <Globe className="text-gold-default" size={16} />;
  };

  return (
    <motion.div
      id="planet-detail-view"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      className="max-w-6xl mx-auto space-y-8 pb-24"
    >
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-gold-default/20 pb-4">
        <Button id="btn-back-to-atlas" onClick={onBack} variant="outline" className="gap-2 text-neutral-grey hover:text-gold-default">
          <ChevronLeft size={16} /> Back to Cosmic Atlas
        </Button>
        <div className="sm:text-right">
          <div className="flex items-center sm:justify-end gap-2 text-[10px] text-neutral-grey uppercase tracking-[0.2em] font-mono">
            {getBiomeIcon(systemInfo.name)}
            <span>Sector Telemetry // {systemInfo.classification}</span>
          </div>
          <h2 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase italic text-gold-default terminal-text-glow">
            {systemInfo.name}
          </h2>
        </div>
      </div>

      {/* Hero Dossier Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Planetary Visual, Coordinates & Core Telemetry */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="relative overflow-hidden group border-gold-default/30 bg-neutral-black/80">
            <div className="absolute inset-0 bg-gradient-to-b from-gold-default/10 via-transparent to-neutral-black/90 pointer-events-none" />
            <div className="relative z-10 p-6 flex flex-col items-center">
              
              {/* Planetary Hologram Frame */}
              <div className="w-48 h-48 sm:w-56 sm:h-56 relative mb-6 flex items-center justify-center">
                <div className="absolute inset-0 bg-gold-default/15 rounded-full blur-2xl animate-pulse" />
                <div className="absolute inset-4 border border-gold-default/20 rounded-full border-dashed animate-spin-slow opacity-60" />
                {systemInfo.image ? (
                  <img
                    src={systemInfo.image}
                    alt={systemInfo.name}
                    className="w-full h-full object-contain relative z-10 drop-shadow-[0_0_40px_rgba(251,191,36,0.35)] animate-float"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <Globe size={72} className="relative z-10 text-gold-default/60" />
                )}
              </div>

              {/* Badges & System Designation */}
              <div className="w-full space-y-3 font-mono text-xs">
                <div className="flex justify-between items-center border-b border-neutral-grey/15 pb-2">
                  <span className="text-[10px] uppercase text-neutral-grey">Sector Grid</span>
                  <span className="font-bold text-gold-default">{systemInfo.coordinates.sectorGrid}</span>
                </div>
                <div className="flex justify-between items-center border-b border-neutral-grey/15 pb-2">
                  <span className="text-[10px] uppercase text-neutral-grey">Climate / Biome</span>
                  <span className="font-bold text-neutral-white text-right max-w-[180px] truncate" title={systemInfo.climate}>
                    {systemInfo.climate}
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-neutral-grey/15 pb-2">
                  <span className="text-[10px] uppercase text-neutral-grey">Surface Gravity</span>
                  <span className="font-bold text-neutral-white">{systemInfo.gravity}</span>
                </div>
                <div className="flex justify-between items-center border-b border-neutral-grey/15 pb-2">
                  <span className="text-[10px] uppercase text-neutral-grey">Key Resource</span>
                  <span className="font-bold text-amber-300 text-right max-w-[180px] truncate" title={systemInfo.dominantResource}>
                    {systemInfo.dominantResource}
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-neutral-grey/15 pb-2">
                  <span className="text-[10px] uppercase text-neutral-grey">Governing Body</span>
                  <span className="font-bold text-blue-300 text-right max-w-[180px] truncate" title={systemInfo.governingFaction}>
                    {systemInfo.governingFaction}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span className="text-[10px] uppercase text-neutral-grey">Resident Species</span>
                  <span className="font-bold text-neutral-white text-right max-w-[180px] truncate">
                    {systemInfo.residentSpecies.length ? systemInfo.residentSpecies.join(', ') : 'Not specified in indexed canon'}
                  </span>
                </div>
              </div>
            </div>
          </Card>

          {/* Astronomical Telemetry */}
          <Card title="Astronomical Telemetry" className="bg-neutral-black/60 border-neutral-grey/20">
            <div className="space-y-2.5 font-mono text-[11px]">
              <div className="flex justify-between border-b border-neutral-grey/10 pb-1.5">
                <span className="text-neutral-grey">Right Ascension (RA):</span>
                <span className="text-gold-default font-bold">{systemInfo.coordinates.ra}</span>
              </div>
              <div className="flex justify-between border-b border-neutral-grey/10 pb-1.5">
                <span className="text-neutral-grey">Declination (DEC):</span>
                <span className="text-gold-default font-bold">{systemInfo.coordinates.dec}</span>
              </div>
              <div className="flex justify-between border-b border-neutral-grey/10 pb-1.5">
                <span className="text-neutral-grey">Solar Distance:</span>
                <span className="text-gold-default font-bold">{systemInfo.coordinates.distance}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-grey">Atmosphere:</span>
                <span className="text-neutral-white text-right max-w-[160px] truncate" title={systemInfo.atmosphere}>
                  {systemInfo.atmosphere}
                </span>
              </div>
            </div>
          </Card>

          {/* On-Chain Metrics if available */}
          {planetMetric && (
            <Card title="WAX DAO Telemetry" className="bg-neutral-black/60 border-emerald-500/20">
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="p-2.5 bg-emerald-500/10 rounded border border-emerald-500/20">
                  <p className="text-[9px] uppercase text-neutral-grey">Passed Proposals</p>
                  <p className="text-xl font-bold font-mono text-emerald-400">{planetMetric.passed_proposals}</p>
                </div>
                <div className="p-2.5 bg-blue-500/10 rounded border border-blue-500/20">
                  <p className="text-[9px] uppercase text-neutral-grey">Active Scribes</p>
                  <p className="text-xl font-bold font-mono text-blue-400">{planetMetric.active_scribes}</p>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Right Column: Planetary Lore Synopsis & Exact Associated Transmissions */}
        <div className="lg:col-span-8 space-y-8">
          
          {/* Sector Lore Overview Card */}
          <Card className="border-gold-default/20 bg-neutral-black/60 p-6">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gold-default mb-2">
              <Sparkles size={14} />
              <span>Sector Dossier & Archive Briefing</span>
            </div>
            <p className="text-sm text-neutral-white/90 leading-relaxed font-sans mb-4">
              {systemInfo.description}
            </p>
            {systemInfo.keyLoreThemes.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2 border-t border-neutral-grey/15">
                {systemInfo.keyLoreThemes.map(theme => (
                  <span key={theme} className="px-2 py-0.5 bg-gold-default/10 border border-gold-default/30 rounded text-[10px] font-mono text-gold-default uppercase tracking-wider">#{theme}</span>
                ))}
              </div>
            )}
          </Card>

          {/* Verified Canon Chronicles Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold uppercase italic text-neutral-white flex items-center gap-2">
                <BookOpen size={20} className="text-gold-default" />
                Verified Planetary Lore Chapters
              </h3>
              <Badge color="gold">{canonLore.length} Verified Records</Badge>
            </div>

            {canonLore.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {canonLore.map(entry => {
                  const wordCount = entry.content.trim().split(/\s+/).filter(Boolean).length;
                  const readingTime = Math.max(1, Math.ceil(wordCount / 220));
                  return (
                    <Card 
                      key={entry.id} 
                      className="hover:border-gold-default/50 bg-neutral-black/70 cursor-pointer transition-all group flex flex-col justify-between p-5 hover:shadow-[0_0_20px_rgba(251,191,36,0.1)]"
                      onClick={() => onLoreClick(entry)}
                    >
                      <div>
                        <div className="flex justify-between items-start mb-2 gap-2">
                          <h4 className="font-bold uppercase italic text-sm text-neutral-white group-hover:text-gold-default transition-colors line-clamp-1">
                            {entry.title}
                          </h4>
                          <span className="px-1.5 py-0.5 bg-gold-default/20 text-gold-default text-[9px] font-mono uppercase rounded flex-shrink-0">
                            Canon
                          </span>
                        </div>
                        <p className="text-xs text-neutral-grey line-clamp-3 mb-4 leading-relaxed font-sans">
                          {entry.content.replace(/[#*`>]/g, '')}
                        </p>
                      </div>

                      <div className="pt-3 border-t border-neutral-grey/15 flex items-center justify-between text-[9px] font-mono text-neutral-grey">
                        <span className="flex items-center gap-1 text-gold-default">
                          <User size={10} /> {entry.authorName || 'Federation Scribe'}
                        </span>
                        <span className="flex items-center gap-1 text-neutral-grey/80">
                          {readingTime} min read • <ArrowRight size={10} className="group-hover:translate-x-1 transition-transform" />
                        </span>
                      </div>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card className="py-10 text-center border-dashed border-neutral-grey/25 bg-neutral-black/40">
                <Radio className="mx-auto mb-2 text-neutral-grey/40" size={28} />
                <p className="text-xs font-bold uppercase text-neutral-grey tracking-widest">
                  No direct canonical chronicles indexed for this specific coordinate.
                </p>
                <p className="text-[11px] text-neutral-grey/60 mt-1">
                  Community proposals and telemetry logs may still be pending governance vote.
                </p>
              </Card>
            )}
          </div>

          {referencedLore.length > 0 && (
            <div className="space-y-4 pt-4 border-t border-neutral-grey/15">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold uppercase italic text-neutral-white flex items-center gap-2">
                  <Layers size={20} className="text-neutral-grey" />
                  Cross-References
                </h3>
                <Badge>{referencedLore.length} References</Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {referencedLore.map(entry => (
                  <Card key={`ref-${entry.id}`} className="cursor-pointer hover:border-neutral-grey/50 bg-neutral-black/50 p-4" onClick={() => onLoreClick(entry)}>
                    <h4 className="text-xs font-bold uppercase italic text-neutral-white">{entry.title}</h4>
                    <p className="text-[10px] text-neutral-grey mt-1">Mentions {systemInfo.name}; indexed primarily under {entry.primaryWorld || 'no single world'}.</p>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* On-Chain Proposed Transmissions Section */}
          <div className="space-y-4 pt-4 border-t border-neutral-grey/15">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold uppercase italic text-neutral-white flex items-center gap-2">
                <Shield size={20} className="text-blue-400" />
                Governance Lore Proposals
              </h3>
              <Badge color="blue">{proposedLore.length} Proposals</Badge>
            </div>

            {proposedLore.length > 0 ? (
              <div className="space-y-3">
                {proposedLore.map(entry => (
                  <Card 
                    key={entry.id} 
                    className="hover:border-blue-400/50 bg-neutral-black/70 cursor-pointer transition-all group flex items-center justify-between p-4"
                    onClick={() => onLoreClick(entry)}
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-4">
                      <div className="w-9 h-9 bg-blue-500/10 border border-blue-500/30 rounded flex items-center justify-center flex-shrink-0">
                        <ExternalLink size={16} className="text-blue-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold uppercase italic text-xs text-neutral-white truncate group-hover:text-blue-400 transition-colors">
                            {entry.title}
                          </h4>
                          <Badge color="blue">{entry.status_label || entry.status}</Badge>
                        </div>
                        <p className="text-[10px] text-neutral-grey font-mono mt-0.5 truncate">
                          By {entry.authorName || entry.authorId} • {entry.votes_for || 0} Votes For • {entry.votes_against || 0} Against
                        </p>
                      </div>
                    </div>

                    <Button variant="ghost" className="text-[10px] font-mono text-blue-400 gap-1 flex-shrink-0">
                      <span>View</span>
                      <ArrowRight size={12} />
                    </Button>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="py-8 text-center border-dashed border-neutral-grey/25 bg-neutral-black/40">
                <p className="text-xs text-neutral-grey uppercase tracking-widest font-mono">
                  No active community proposals for this sector at this time.
                </p>
              </Card>
            )}
          </div>

        </div>
      </div>
    </motion.div>
  );
};
