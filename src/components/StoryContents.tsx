import {useMemo} from 'react';
import {normalizeLoreMarkdown} from './LoreContent';
export function StoryContents({content}:{content:string}){
 const headings=useMemo(()=>Array.from(normalizeLoreMarkdown(content).matchAll(/^(#{1,6})[ \t]+(.+?)\s*$/gm)).map((m,i)=>({index:i,level:m[1].length,title:m[2].replace(/[*`]/g,'')})),[content]);
 if(headings.length<2)return null;
 function jump(index:number){const root=document.getElementById('lore-content-container');root?.querySelectorAll('h1,h2,h3,h4,h5,h6')[index]?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}
 return <details className="mb-6 border border-gold-default/25 bg-neutral-black/60 p-4"><summary className="cursor-pointer text-gold-default text-sm uppercase tracking-widest">Contents · {headings.length} sections</summary><nav aria-label="Story contents" className="grid sm:grid-cols-2 gap-x-6 mt-3 max-h-80 overflow-y-auto">{headings.map(h=><button key={h.index} onClick={()=>jump(h.index)} className="text-left text-sm py-2 text-neutral-grey hover:text-blue-default" style={{paddingLeft:Math.min(h.level-1,3)*10}}>{h.title}</button>)}</nav></details>;
}