import fs from 'node:fs';

const absentChecks = [
  ['server/waxIngester.ts', /pull_req_id\s*\|\|\s*propId/, 'proposal ID is being used as a fallback GitHub PR ID'],
  ['server/waxIngester.ts', /findMatchingStory\s*\(/, 'fuzzy story matcher is still present'],
  ['server/waxIngester.ts', /Math\.floor\(Math\.random\(\)\s*\*\s*18\)/, 'synthetic governance votes are still present'],
  ['src/App.tsx', /const key = .*title\.toLowerCase\(\)\.trim\(\)/, 'title is still being used as archive identity'],
  ['src/App.tsx', /prs\.find\([\s\S]{0,300}title\.toLowerCase\(\)\.includes/, 'GitHub PR author is still guessed by fuzzy title similarity'],
  ['src/services/canonService.ts', /the-lore\/pull\/\$\{prop\.proposal_id\}/, 'WAX proposal ID is still being presented as a GitHub PR ID'],
  ['server/githubIngester.ts', /const datasetPath[\s\S]{0,100}loreDataset\.json/, 'derived loreDataset is still being ingested as graph authority'],
  ['server/githubIngester.ts', /pr_stories\.json/, 'legacy PR salvage is still directly ingested as canon-graph authority'],
  ['scripts/extract_prs.js', /writeFileSync\([^\n]*pr_stories\.json/, 'PR recovery script can overwrite the runtime salvage corpus'],
  ['scripts/extract_prs.js', /mapping\.marker|prDossierMap/, 'PR recovery still uses hard-coded title/marker guesses'],
  ['package.json', /@google\/genai/, 'unused Google GenAI dependency is still declared'],
  ['metadata.json', /GEMINI|AI_STUDIO|SERVER_SIDE_GEMINI/i, 'AI Studio/Gemini capability residue is still declared'],
  ['src/constants/loreParser.ts', /slice\(0,\s*5000\)/, 'lore parser still truncates narratives to 5,000 characters'],
  ['src/constants/planetLoreMapping.ts', /canon_\d+.*canon_\d+|startId|endId|idRange/i, 'Atlas still classifies lore by canon ID ranges'],
  ['src/App.tsx', /item\.tags\.some\(t => t\.toLowerCase\(\) === planetFilter/, 'archive planet filter still treats references as primary placement'],
  ['server/githubIngester.ts', /resolution_status IN \('resolved', 'legacy_salvage'\)/, 'legacy salvage still enters canon graph authority'],
  ['src/App.tsx', /wormhole_conduit|Null \/ Unit-0 \/ Elsewhere|origin_singularity/, 'hard-coded fake Atlas relationship graph is still mounted'],
  ['src/components/LoreGraph.tsx', /'alta': '\/assets\/iPS42_Eyeke|lopat debris field|unit-0|elsewhere/, 'graph still assigns unrelated frontier artwork to other worlds'],
  ['src/App.tsx', /<AtlasView\b|import \{ AtlasView \}/, 'interactive D3 Atlas has been replaced by the card/list AtlasView'],
  ['src/services/waxService.ts', /WalletPluginWombat|wallet-plugin-wombat/, 'deprecated Wombat wallet plugin is still wired into the login stack'],
  ['package.json', /wallet-plugin-wombat/, 'deprecated Wombat wallet package is still declared'],
  ['src/App.tsx', /content\.split\(\/\^##\\s\+\/m\)|Sync Canon Lore \(GitHub\)/, 'client still parses README headings into Firestore canon records'],
  ['src/components/LoreGraph.tsx', /forceSimulation|forceLink|marker-end|className=\"links\"/, 'Atlas has regressed into a force-directed relationship graph'],
  ['src/App.tsx', /role:\s*updatedRole|role:\s*stats\.role[\s\S]{0,120}updateDoc\(doc\(db, 'users'/, 'WAX linking can still mutate Firebase authorization roles'],
];

const presentChecks = [
  ['server/db.ts', /source_url TEXT/, 'proposal source_url provenance column'],
  ['server/db.ts', /pull_request_id INTEGER/, 'proposal pull_request_id provenance column'],
  ['server/db.ts', /CREATE TABLE IF NOT EXISTS github_pr_sources/, 'persistent GitHub PR source cache'],
  ['server/db.ts', /last_attempt_at INTEGER/, 'GitHub source cache tracks refresh attempts separately from valid content'],
  ['server/waxIngester.ts', /sourceUrl,\s*\n\s*referencedPrId/, 'WAX ingestion persists explicit source provenance'],
  ['server/waxIngester.ts', /resolveGitHubPrNarrative\(referencedPrId/, 'WAX ingestion resolves the exact referenced GitHub PR'],
  ['server/waxIngester.ts', /GITHUB_SYNC_MAX_PER_CYCLE/, 'GitHub narrative lookup has a per-cycle network budget'],
  ['server/waxIngester.ts', /Number\.isFinite\(configuredGithubBudget\)/, 'GitHub network budget supports an explicit zero value'],
  ['server/waxIngester.ts', /stale_cache_after_/, 'transient GitHub failures preserve previously verified exact content'],
  ['server/waxIngester.ts', /transientRefreshFresh/, 'failed refreshes are throttled while stale-safe exact content is served'],
  ['server/githubPrNarrative.js', /multiple_non_readme_markdown_files/, 'ambiguous PR file changes fail closed instead of guessing'],
  ['server/githubPrNarrative.js', /changed_file_list_paginated/, 'paginated PR file lists fail closed instead of using a partial source set'],
  ['server/githubPrNarrative.js', /extractAddedMarkdownFromPatch/, 'README-only PRs attribute only added patch lines'],
  ['server/githubIngester.ts', /FROM github_pr_sources/, 'canon graph reads only persisted provenance-aware GitHub sources'],
  ['server/githubIngester.ts', /DELETE FROM canon_nodes WHERE id LIKE 'canon_pr_%'/, 'PR-derived canon graph nodes are rebuilt instead of left stale'],
  ['src/App.tsx', /Narrative: \{selectedLore\.narrative_source_status/, 'reader surfaces narrative provenance state'],
  ['server/githubIngester.ts', /"federation",\s*\n\s*`planet_\$\{planet\.id\}`/, 'canon graph uses stable node ids'],
  ['scripts/extract_prs.js', /pr_corpus_rebuild_manifest\.json/, 'offline corpus recovery writes a reviewable manifest'],
  ['src/constants/loreIndex.ts', /primaryWorld/, 'primary/reference world separation'],
  ['src/constants/loreIndex.ts', /mentionedWorlds/, 'world-reference index'],
  ['src/components/LoreContent.tsx', /normalizeLoreMarkdown/, 'HTML-ish lore normalization before Markdown rendering'],
  ['server/waxIngester.ts', /LEGACY_PR_SALVAGE_ENABLED === ["']true["']/, 'legacy PR salvage is explicit opt-in'],
  ['src/App.tsx', /<LoreGraph[\s\S]*entities=\{atlasGraph\.entities\}[\s\S]*relationships=\{atlasGraph\.relationships\}/, 'original interactive D3 Atlas is mounted with lore-derived graph data'],
  ['src/App.tsx', /buildAtlasGraph\(lore\)/, 'Atlas graph is derived from the normalized archive index'],
  ['src/constants/atlasGraph.ts', /cross_reference/, 'Atlas derives world cross-references from indexed lore instead of fabricated routes'],
  ['src/components/LoreGraph.tsx', /<ellipse[\s\S]*orbit-/, 'Atlas renders orbital lanes rather than relationship spaghetti'],
  ['src/components/LoreGraph.tsx', /animateMotion/, 'Atlas supports orbital motion'],
  ['src/components/LoreGraph.tsx', /d3\.zoom/, 'Atlas retains interactive pan and zoom'],
  ['src/constants/planetLoreMapping.ts', /LORE_WORLDS/, 'Atlas systems derive from the source-supported world registry'],
  ['src/App.tsx', /fetch\('\/api\/canon\/sync', \{ method: 'POST', headers:/, 'client canon sync delegates to provenance-aware server'],
  ['src/App.tsx', /authoritativeSourceUrls\.has\(normalized\.sourceUrl\)/, 'exact-source Firestore duplicates are suppressed without title dedupe'],
  ['src/components/LoreGraph.tsx', /Orbital positions are navigational, not canonical coordinates/, 'Atlas clearly labels schematic orbital placement'],
];

let failed = false;
for (const [file, pattern, message] of absentChecks) {
  const source = fs.readFileSync(file, 'utf8');
  if (pattern.test(source)) {
    console.error(`FAIL ${file}: ${message}`);
    failed = true;
  } else {
    console.log(`OK   ${file}: ${message} — absent`);
  }
}

for (const [file, pattern, message] of presentChecks) {
  const source = fs.readFileSync(file, 'utf8');
  if (!pattern.test(source)) {
    console.error(`FAIL ${file}: missing ${message}`);
    failed = true;
  } else {
    console.log(`OK   ${file}: ${message} — present`);
  }
}

if (failed) process.exit(1);
console.log('Narrative provenance guardrails passed.');
