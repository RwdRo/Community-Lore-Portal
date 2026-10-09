import React, { useMemo, useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpen, Clock, CheckCircle2 } from 'lucide-react';

interface LoreContentProps {
  content: string;
  onLinkClick: (title: string) => void;
}

const decodeLoreEntities = (value: string): string => value
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'");

/**
 * Historical lore was authored across Markdown, README fragments and HTML-ish
 * exports. Convert the small formatting subset we actually see into Markdown
 * and strip the remaining tags rather than enabling raw HTML in the reader.
 */
export const normalizeLoreMarkdown = (raw: string): string => {
  let text = String(raw || '').replace(/\r\n?/g, '\n');
  // Preserve authored code verbatim while normalizing legacy HTML outside it.
  const literals:string[]=[];
  text=text.replace(/^([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\2[ \t]*$/gm,match=>{const index=literals.push(match)-1;return '\u0000LORE_LITERAL_'+index+'\u0000';});

  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n\n---\n\n')
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_match, level, body) => `${'#'.repeat(Number(level))} ${body.trim()}\n\n`)
    .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**')
    .replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*')
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_match, body) => body.split(/\n/).map((line: string) => `> ${line.trim()}`).join('\n') + '\n\n')
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')
    .replace(/<\/(?:p|div|section|article|ul|ol)>/gi, '\n\n')
    .replace(/<(?:p|div|section|article|ul|ol)[^>]*>/gi, '')
    .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    .replace(/<!--[^]*?-->/g, '')
    .replace(/<\/?(?:script|style|iframe)\b[^>]*>/gi, '')
    .replace(/<\/?[a-z][a-z0-9-]*(?:\s[^>]*)?\/?>/gi, match => /^(?:<\/?(?:span|font|center|small|sup|sub|table|thead|tbody|tr|td|th)\b)/i.test(match)?'':match.replace(/</g,'&lt;').replace(/>/g,'&gt;'))
    .replace(/\\\s*\n/g, '\n');

  text = decodeLoreEntities(text)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();

  return text.replace(/\u0000LORE_LITERAL_(\d+)\u0000/g,(_match,index)=>literals[Number(index)]);
};

export const LoreContent: React.FC<LoreContentProps> = ({ content, onLinkClick }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);

  const normalizedContent = useMemo(() => normalizeLoreMarkdown(content), [content]);

  // Compute reading statistics from what the reader actually renders.
  const { wordCount, readingTimeMinutes } = useMemo(() => {
    const words = normalizedContent.trim().split(/\s+/).filter(Boolean).length;
    const minutes = Math.max(1, Math.ceil(words / 220));
    return { wordCount: words, readingTimeMinutes: minutes };
  }, [normalizedContent]);

  // Handle [[Wiki Links]] after source normalization.
  const formattedContent = useMemo(() => {
    return normalizedContent.replace(/\[\[(.*?)\]\]/g, (_match, target) => {
      const clean = String(target || '').trim();
      return clean ? `[${clean}](#wiki:${encodeURIComponent(clean)})` : '';
    });
  }, [normalizedContent]);

  // Track scrolling progress through this specific lore piece
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Reset progress when content changes
    setScrollProgress(0);

    // Find scroll parent or default to window
    const getScrollParent = (node: HTMLElement | null): HTMLElement | Window => {
      let parent = node?.parentElement;
      while (parent) {
        const style = window.getComputedStyle(parent);
        if (
          (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
          parent.scrollHeight > parent.clientHeight
        ) {
          return parent;
        }
        parent = parent.parentElement;
      }
      return window;
    };

    const scrollContainer = getScrollParent(el);

    const calculateProgress = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();

      let viewportHeight: number;
      let containerTop: number;

      if (scrollContainer === window) {
        viewportHeight = window.innerHeight;
        containerTop = 0;
      } else {
        const parentRect = (scrollContainer as HTMLElement).getBoundingClientRect();
        viewportHeight = (scrollContainer as HTMLElement).clientHeight;
        containerTop = parentRect.top;
      }

      const relativeTop = rect.top - containerTop;
      const contentHeight = rect.height;

      // If content is shorter than the viewport, it is fully visible
      if (contentHeight <= viewportHeight) {
        setScrollProgress(100);
        return;
      }

      // Calculate progress as user scrolls through the content
      const totalScrollableDistance = contentHeight - viewportHeight + 60;
      const scrolled = -relativeTop;

      if (scrolled <= 0) {
        setScrollProgress(0);
      } else if (scrolled >= totalScrollableDistance) {
        setScrollProgress(100);
      } else {
        const pct = Math.min(100, Math.max(0, Math.round((scrolled / totalScrollableDistance) * 100)));
        setScrollProgress(pct);
      }
    };

    calculateProgress();

    const targetListener = scrollContainer;
    targetListener.addEventListener('scroll', calculateProgress, { passive: true });
    window.addEventListener('scroll', calculateProgress, { passive: true });
    window.addEventListener('resize', calculateProgress);

    return () => {
      targetListener.removeEventListener('scroll', calculateProgress);
      window.removeEventListener('scroll', calculateProgress);
      window.removeEventListener('resize', calculateProgress);
    };
  }, [content]);

  return (
    <div ref={containerRef} id="lore-content-container" className="space-y-4 relative [&_h1]:scroll-mt-24 [&_h2]:scroll-mt-24 [&_h3]:scroll-mt-24">
      {/* Top Reading Progress Bar (Sticky within the reader view) */}
      <div 
        id="lore-reading-progress-header" 
        className="sticky top-0 z-20 -mx-2 px-3 py-2.5 bg-neutral-black/90 backdrop-blur-md border border-neutral-grey/15 rounded-lg space-y-2 shadow-lg"
      >
        <div className="flex items-center justify-between gap-3 text-[10px] font-mono">
          <div className="flex items-center gap-3 text-neutral-grey flex-wrap">
            <div className="flex items-center gap-1.5 text-gold-default font-semibold">
              <BookOpen size={12} />
              <span>{wordCount.toLocaleString()} WORDS</span>
            </div>
            <span className="text-neutral-grey/30">•</span>
            <div className="flex items-center gap-1.5 text-blue-300">
              <Clock size={12} />
              <span>~{readingTimeMinutes} MIN READ</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 font-bold flex-shrink-0">
            {scrollProgress >= 100 ? (
              <span className="flex items-center gap-1 text-emerald-400 text-[10px] tracking-wider uppercase">
                <CheckCircle2 size={12} className="text-emerald-400" />
                Read Complete
              </span>
            ) : (
              <span className="text-gold-default text-[10px] tracking-wider uppercase font-mono">
                {scrollProgress}% Read
              </span>
            )}
          </div>
        </div>

        {/* Visual Progress Bar Track */}
        <div
          id="lore-reading-progress-track"
          className="w-full h-1.5 bg-neutral-grey/20 rounded-full overflow-hidden relative"
          role="progressbar"
          aria-valuenow={scrollProgress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Lore reading progress"
        >
          <div
            id="lore-reading-progress-bar"
            className="h-full bg-gradient-to-r from-gold-default/90 via-gold-default to-amber-300 transition-[width] duration-150 ease-out rounded-full shadow-[0_0_8px_rgba(251,191,36,0.6)]"
            style={{ width: `${scrollProgress}%` }}
          />
        </div>
      </div>

      {/* Markdown Reader Body */}
      <div className="prose prose-invert max-w-none text-neutral-white/95 leading-relaxed font-sans text-sm selection:bg-gold-default/30 selection:text-white">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => (
              <h1 className="text-2xl sm:text-3xl font-black uppercase italic tracking-tighter text-gold-default mt-8 mb-4 pb-2 border-b border-gold-default/20">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-xl sm:text-2xl font-bold uppercase italic tracking-tight text-neutral-white mt-6 mb-3 pb-1 border-b border-neutral-grey/15">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-lg font-bold uppercase tracking-wide text-blue-300 mt-5 mb-2">
                {children}
              </h3>
            ),
            h4: ({ children }) => (
              <h4 className="text-base font-semibold uppercase tracking-wider text-purple-300 mt-4 mb-2">
                {children}
              </h4>
            ),
            p: ({ children }) => (
              <p className="mb-4 text-sm leading-relaxed text-neutral-white/90">
                {children}
              </p>
            ),
            blockquote: ({ children }) => (
              <blockquote className="my-4 border-l-2 border-gold-default pl-4 py-1 italic bg-gold-default/[0.03] text-neutral-white/80 rounded-r">
                {children}
              </blockquote>
            ),
            ul: ({ children }) => (
              <ul className="list-disc list-inside space-y-1.5 my-3 pl-2 text-sm text-neutral-white/90">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal list-inside space-y-1.5 my-3 pl-2 text-sm text-neutral-white/90">
                {children}
              </ol>
            ),
            li: ({ children }) => (
              <li className="leading-relaxed">{children}</li>
            ),
            hr: () => (
              <hr className="my-6 border-neutral-grey/20" />
            ),
            a: ({ href, children }) => {
              if (href && href.startsWith('#wiki:')) {
                const target = decodeURIComponent(href.replace('#wiki:', ''));
                return (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      onLinkClick(target);
                    }}
                    className="text-gold-default hover:text-gold-hover hover:underline font-bold italic inline-flex items-center gap-0.5"
                  >
                    {children}
                  </button>
                );
              }
              return (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
                >
                  {children}
                </a>
              );
            },
            code: ({ children }) => (
              <code className="bg-neutral-black/80 text-gold-default border border-neutral-grey/20 px-1.5 py-0.5 rounded font-mono text-xs">
                {children}
              </code>
            ),
            pre: ({ children }) => (
              <pre className="bg-neutral-black/90 p-4 rounded border border-neutral-grey/20 overflow-x-auto text-xs font-mono text-neutral-white/90 my-4">
                {children}
              </pre>
            ),
            table: ({ children }) => (
              <div className="overflow-x-auto my-4 border border-neutral-grey/20 rounded">
                <table className="w-full text-left text-xs border-collapse font-sans">
                  {children}
                </table>
              </div>
            ),
            th: ({ children }) => (
              <th className="bg-neutral-black/80 p-2.5 font-bold uppercase tracking-widest text-gold-default border-b border-neutral-grey/20">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="p-2.5 border-b border-neutral-grey/10 text-neutral-white/90">
                {children}
              </td>
            )
          }}
        >
          {formattedContent}
        </ReactMarkdown>
      </div>
    </div>
  );
};
