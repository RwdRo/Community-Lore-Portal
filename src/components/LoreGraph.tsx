import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Crosshair, Maximize2, Minus, Plus, RotateCcw } from 'lucide-react';

const PLANET_ASSETS: Record<string, string> = {
  eyeke: '/assets/iPS42_Eyeke.png',
  kavian: '/assets/iPS42_Kavian.png',
  magor: '/assets/iPS42_Magor.png',
  naron: '/assets/iPS42_Naron.png',
  neri: '/assets/iPS42_Neri.png',
  veles: '/assets/iPS42_Veles.png',
};

const FRONTIER_ORDER = ['Eyeke', 'Kavian', 'Magor', 'Naron', 'Neri', 'Veles'];

export interface GraphNode {
  id: string;
  name: string;
  type: 'planets' | 'species' | 'factions' | 'technology' | 'general';
  category?: string;
}

export interface GraphLink {
  source: string;
  target: string;
  predicate: string;
}

interface LoreGraphProps {
  entities: { name: string; type: string; category?: string }[];
  relationships: { subject: string; predicate: string; object: string }[];
  onNodeClick?: (nodeId: string, nodeType: string) => void;
  activeFilter?: 'all' | 'planets' | 'species' | 'factions' | 'technology';
}

interface OrbitWorld extends GraphNode {
  radius: number;
  angle: number;
  duration: number;
  image: string | null;
  referenceCount: number;
  classification: 'frontier' | 'homeworld' | 'documented';
}

const classifyWorld = (category?: string): OrbitWorld['classification'] => {
  const value = String(category || '').toLowerCase();
  if (value.includes('frontier')) return 'frontier';
  if (value.includes('homeworld') || value.includes('federation')) return 'homeworld';
  return 'documented';
};

const nodeType = (value?: string): GraphNode['type'] => {
  const type = String(value || '').toLowerCase();
  if (type.includes('planet') || type.includes('world')) return 'planets';
  if (type.includes('specie')) return 'species';
  if (type.includes('faction')) return 'factions';
  if (type.includes('tech') || type.includes('weapon') || type.includes('tool')) return 'technology';
  return 'general';
};

/**
 * Lore Atlas presentation layer.
 *
 * This component is deliberately an orbital astrometry projection, not a
 * force-directed knowledge graph. Relationships are used only as contextual
 * archive telemetry; they are never rendered as permanent connector lines.
 * The positions are schematic because the archive does not contain canonical
 * stellar coordinates for every documented world.
 */
export const LoreGraph: React.FC<LoreGraphProps> = ({ entities, relationships, onNodeClick }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [hovered, setHovered] = useState<OrbitWorld | null>(null);
  const [motionEnabled, setMotionEnabled] = useState(true);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setMotionEnabled(!preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  const worlds = useMemo<OrbitWorld[]>(() => {
    const unique = new Map<string, GraphNode>();
    for (const entity of entities) {
      if (nodeType(entity.type) !== 'planets') continue;
      const name = String(entity.name || '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!unique.has(key)) unique.set(key, { id: name, name, type: 'planets', category: entity.category });
    }

    const sorted = Array.from(unique.values()).sort((a, b) => {
      const ai = FRONTIER_ORDER.indexOf(a.name);
      const bi = FRONTIER_ORDER.indexOf(b.name);
      if (ai >= 0 || bi >= 0) {
        if (ai < 0) return 1;
        if (bi < 0) return -1;
        return ai - bi;
      }
      return a.name.localeCompare(b.name);
    });

    return sorted.map((world, index) => {
      const classification = classifyWorld(world.category);
      const frontierIndex = FRONTIER_ORDER.indexOf(world.name);
      const radius = frontierIndex >= 0
        ? 84 + frontierIndex * 38
        : 330 + Math.max(0, index - FRONTIER_ORDER.length) * 34;
      const angle = frontierIndex >= 0
        ? (frontierIndex * 57 + 18) % 360
        : ((index - FRONTIER_ORDER.length) * 47 + 12) % 360;
      const key = world.name.toLowerCase();
      const referenceCount = relationships.filter(rel =>
        String(rel.subject || '').toLowerCase() === key || String(rel.object || '').toLowerCase() === key
      ).length;

      return {
        ...world,
        radius,
        angle,
        duration: 70 + index * 9,
        image: PLANET_ASSETS[key] || null,
        referenceCount,
        classification,
      };
    });
  }, [entities, relationships]);

  useEffect(() => {
    const svgElement = svgRef.current;
    const viewport = viewportRef.current;
    if (!svgElement || !viewport) return;

    const svg = d3.select(svgElement);
    const content = d3.select(viewport);
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.45, 3.5])
      .on('zoom', event => content.attr('transform', event.transform));

    zoomRef.current = zoom;
    svg.call(zoom);
    svg.call(zoom.transform, d3.zoomIdentity);

    return () => {
      svg.on('.zoom', null);
    };
  }, []);

  const zoomBy = (factor: number) => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).transition().duration(motionEnabled ? 220 : 0).call(zoomRef.current.scaleBy, factor);
  };

  const resetZoom = () => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).transition().duration(motionEnabled ? 350 : 0).call(zoomRef.current.transform, d3.zoomIdentity);
  };



  return (
    <div className="relative h-[650px] md:h-[720px] w-full overflow-hidden rounded-xl border border-gold-default/20 bg-[#050505] shadow-[inset_0_0_80px_rgba(0,0,0,0.9)]">
      <div className="absolute left-4 top-4 z-20 pointer-events-none">
        <div className="text-[9px] font-mono uppercase tracking-[0.24em] text-gold-default">Federation Astrometry Projection</div>
        <div className="mt-1 text-[8px] font-mono uppercase tracking-widest text-neutral-grey/70">Schematic orbital placement • archive navigation layer</div>
      </div>

      <div className="absolute right-4 top-4 z-30 flex items-center gap-1 rounded border border-neutral-grey/20 bg-neutral-black/85 p-1 backdrop-blur">
        <button type="button" onClick={() => zoomBy(1.25)} className="p-2 text-neutral-grey hover:text-gold-default" title="Zoom in"><Plus size={14} /></button>
        <button type="button" onClick={() => zoomBy(0.8)} className="p-2 text-neutral-grey hover:text-gold-default" title="Zoom out"><Minus size={14} /></button>
        <button type="button" onClick={resetZoom} className="p-2 text-neutral-grey hover:text-gold-default" title="Reset view"><RotateCcw size={14} /></button>
        <button type="button" onClick={() => setMotionEnabled(value => !value)} className={`p-2 ${motionEnabled ? 'text-gold-default' : 'text-neutral-grey'} hover:text-gold-default`} title={motionEnabled ? 'Pause orbital motion' : 'Resume orbital motion'}><Crosshair size={14} /></button>
      </div>

      <svg ref={svgRef} viewBox="0 0 1000 780" className="h-full w-full cursor-grab active:cursor-grabbing" role="img" aria-label="Interactive orbital lore atlas">
        <defs>
          <radialGradient id="atlas-star" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff7d6" />
            <stop offset="28%" stopColor="#fbbf24" />
            <stop offset="65%" stopColor="#b45309" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
          </radialGradient>
          <filter id="atlas-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="planet-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <g ref={viewportRef}>
          {/* star field */}
          {Array.from({ length: 110 }).map((_, i) => {
            const x = (i * 83 + 41) % 1000;
            const y = (i * 137 + 29) % 780;
            const r = 0.45 + (i % 4) * 0.22;
            const opacity = 0.14 + (i % 7) * 0.055;
            return <circle key={`star-${i}`} cx={x} cy={y} r={r} fill="#f8fafc" opacity={opacity} />;
          })}

          {/* schematic orbital lanes */}
          {worlds.map(world => (
            <ellipse
              key={`orbit-${world.id}`}
              cx="500"
              cy="390"
              rx={world.radius}
              ry={world.radius * 0.58}
              fill="none"
              stroke={world.classification === 'frontier' ? 'rgba(251,191,36,0.18)' : 'rgba(148,163,184,0.10)'}
              strokeWidth={world.classification === 'frontier' ? 1.15 : 0.75}
              strokeDasharray={world.classification === 'frontier' ? undefined : '4 8'}
            />
          ))}

          {/* archive stellar anchor */}
          <g transform="translate(500 390)" filter="url(#atlas-glow)">
            <circle r="52" fill="url(#atlas-star)" opacity="0.34" />
            <circle r="17" fill="#fbbf24" opacity="0.95" />
            <circle r="7" fill="#fff7d6" />
          </g>
          <text x="500" y="430" textAnchor="middle" fill="rgba(251,191,36,0.8)" fontSize="9" fontFamily="monospace" letterSpacing="2.6">FEDERATION ARCHIVE</text>

          {worlds.map(world => {
            const theta = world.angle * Math.PI / 180;
            const x = 500 + Math.cos(theta) * world.radius;
            const y = 390 + Math.sin(theta) * world.radius * 0.58;
            const imageSize = world.classification === 'frontier' ? 48 : 30;

            return (
              <g
                key={world.id}
                className="cursor-pointer focus:outline-none"
                role="button"
                tabIndex={0}
                aria-label={`Explore ${world.name}`}
                onFocus={() => setHovered(world)}
                onBlur={() => setHovered(null)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onNodeClick?.(world.id, 'planets');
                  }
                }}
                onMouseEnter={() => setHovered(world)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onNodeClick?.(world.id, 'planets')}
                transform={motionEnabled ? undefined : `translate(${x} ${y})`}
              >
                {motionEnabled && (
                  <animateMotion
                    path={`M ${x} ${y} A ${world.radius} ${world.radius * 0.58} 0 1 1 ${1000-x} ${780-y} A ${world.radius} ${world.radius * 0.58} 0 1 1 ${x} ${y}`}
                    dur={`${world.duration}s`}
                    repeatCount="indefinite"
                  />
                )}

                <circle
                  r={world.classification === 'frontier' ? 25 : 17}
                  fill={world.classification === 'frontier' ? 'rgba(251,191,36,0.08)' : 'rgba(96,165,250,0.07)'}
                  stroke={hovered?.id === world.id ? '#fbbf24' : world.classification === 'frontier' ? 'rgba(251,191,36,0.45)' : 'rgba(148,163,184,0.35)'}
                  strokeWidth={hovered?.id === world.id ? 2 : 1}
                  filter="url(#planet-glow)"
                />

                {world.image ? (
                  <image href={world.image} x={-imageSize / 2} y={-imageSize / 2} width={imageSize} height={imageSize} preserveAspectRatio="xMidYMid meet" />
                ) : (
                  <g>
                    <circle r="10" fill={world.classification === 'homeworld' ? '#94a3b8' : '#64748b'} opacity="0.9" />
                    <circle r="6" fill="#111827" opacity="0.5" />
                    <path d="M-13 0 C-5 -4 5 -4 13 0 C5 4 -5 4 -13 0" fill="none" stroke="rgba(203,213,225,0.55)" strokeWidth="1" />
                  </g>
                )}

                <text y={world.classification === 'frontier' ? 37 : 29} textAnchor="middle" fill={hovered?.id === world.id ? '#fbbf24' : '#e5e7eb'} fontSize="9" fontWeight="700" fontFamily="monospace" letterSpacing="1.2">
                  {world.name.toUpperCase()}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {hovered && (
        <div className="absolute bottom-4 left-4 z-30 min-w-[230px] max-w-[320px] border border-gold-default/25 bg-neutral-black/92 p-3 font-mono backdrop-blur-md shadow-xl pointer-events-none">
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs font-black uppercase tracking-widest text-gold-default">{hovered.name}</span>
            <Maximize2 size={12} className="text-neutral-grey" />
          </div>
          <div className="mt-2 space-y-1 text-[9px] uppercase tracking-wider text-neutral-grey">
            <div className="flex justify-between gap-5"><span>Archive Class</span><span className="text-neutral-white">{hovered.category || 'Documented World'}</span></div>
            <div className="flex justify-between gap-5"><span>Indexed References</span><span className="text-neutral-white">{hovered.referenceCount}</span></div>
            <div className="pt-1 text-gold-default/80">Click to enter planetary dossier</div>
          </div>
        </div>
      )}

      <div className="absolute bottom-4 right-4 z-20 text-right text-[8px] font-mono uppercase tracking-[0.18em] text-neutral-grey/60 pointer-events-none">
        Drag to pan • wheel to zoom<br />Orbital positions are navigational, not canonical coordinates
      </div>
    </div>
  );
};
