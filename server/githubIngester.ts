import { getDatabase, persistDatabase } from "./db";

// Source-supported world registry used by the server-side graph. The registry
// is intentionally sparse: it identifies worlds and their archive role without
// inventing environmental, political or faction metadata.
const INDEX_WORLDS = [
  { id: "eyeke", name: "Eyeke", classification: "frontier_world" },
  { id: "kavian", name: "Kavian", classification: "frontier_world" },
  { id: "magor", name: "Magor", classification: "frontier_world" },
  { id: "naron", name: "Naron", classification: "frontier_world" },
  { id: "neri", name: "Neri", classification: "frontier_world" },
  { id: "veles", name: "Veles", classification: "frontier_world" },
  { id: "alta", name: "Alta", classification: "federation_homeworld" },
  { id: "khaur", name: "Khaur", classification: "federation_homeworld" },
  { id: "velgemmis", name: "Velgemmis", classification: "federation_homeworld" },
  { id: "lopat", name: "Lopat", classification: "federation_homeworld" },
  { id: "earth", name: "Earth", classification: "federation_homeworld" },
  { id: "alfrheim", name: "Alfrheim", classification: "documented_world" },
  { id: "new-pleione", name: "New Pleione", classification: "documented_world" },
  { id: "nyssari", name: "Nyssari", classification: "documented_world" },
];

const PLANET_IDS = new Map(INDEX_WORLDS.map((world) => [world.name.toLowerCase(), `planet_${world.id}`]));

export async function syncGitHubCanon(): Promise<{ nodes: number; edges: number }> {
  const db = await getDatabase();
  const now = Date.now();

  let nodeCount = 0;
  let edgeCount = 0;

  db.run(
    `INSERT OR REPLACE INTO canon_nodes (id, name, type, planet, faction, description, metadata_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ["federation", "Federation", "federation", "Federation", "", "", JSON.stringify({ source: "system-index" }), now]
  );
  nodeCount++;

  // Ingest planetary index nodes and compute metrics from proposals table.
  for (const planet of INDEX_WORLDS) {
    db.run(
      `INSERT OR REPLACE INTO canon_nodes (id, name, type, planet, faction, description, metadata_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `planet_${planet.id}`,
        planet.name,
        planet.classification,
        planet.name,
        "",
        "",
        JSON.stringify({ sector: planet.id, classification: planet.classification, source: "system-index" }),
        now
      ]
    );
    nodeCount++;

    // Compute REAL counts for this planet from the proposals table
    const propCountResult = db.exec("SELECT COUNT(*) FROM proposals WHERE LOWER(planet) = LOWER(?)", [planet.name]);
    const activeLoreCount = propCountResult[0]?.values[0]?.[0] || 0;

    const passedResult = db.exec("SELECT COUNT(*) FROM proposals WHERE LOWER(planet) = LOWER(?) AND (status_label IN ('passed', 'executed', 'passing') OR status = 4)", [planet.name]);
    const passedCount = passedResult[0]?.values[0]?.[0] || 0;

    const scribesResult = db.exec("SELECT COUNT(DISTINCT proposer) FROM proposals WHERE LOWER(planet) = LOWER(?)", [planet.name]);
    const scribesCount = scribesResult[0]?.values[0]?.[0] || 0;

    db.run(
      `INSERT OR REPLACE INTO planetary_metrics (planet_id, planet_name, active_lore_count, passed_proposals, active_scribes, description, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        planet.id,
        planet.name,
        Number(activeLoreCount),
        Number(passedCount),
        Number(scribesCount),
        "",
        now
      ]
    );
  }

  // Connect planet index nodes to the Federation using stable node ids.
  for (const planet of INDEX_WORLDS) {
    db.run(
      `INSERT OR REPLACE INTO canon_edges (id, source, target, relation, weight, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        `edge_federation_${planet.id}`,
        "federation",
        `planet_${planet.id}`,
        planet.classification,
        1.0,
        now
      ]
    );
    edgeCount++;
  }

  // Rebuild PR-derived graph material from the current provenance cache so a
  // source that becomes unresolved or changes planet cannot leave stale nodes
  // or edges behind. Planet/Federation index nodes are independent.
  db.run("DELETE FROM canon_edges WHERE id LIKE 'edge_pr_%'");
  db.run("DELETE FROM canon_nodes WHERE id LIKE 'canon_pr_%'");

  // Ingest only exact GitHub PR narratives that have been resolved and cached
  // by the WAX -> pull_req_id provenance join. Static/derived corpora are not
  // canon-graph authority.
  try {
    const sourceResults = db.exec(
      `SELECT pr_id, pr_url, title, author, file_path, source_kind, content, content_sha256, resolution_status
       FROM github_pr_sources
       WHERE content IS NOT NULL AND content != ''
         AND resolution_status = 'resolved'
       ORDER BY pr_id ASC`
    );

    const planetResults = db.exec(
      `SELECT pull_request_id, planet FROM proposals
       WHERE pull_request_id IS NOT NULL AND pull_request_id > 0`
    );
    const planetByPr = new Map<number, string>();
    if (planetResults.length) {
      for (const row of planetResults[0].values) {
        const prId = Number(row[0]);
        const planet = String(row[1] || 'Federation');
        if (prId > 0 && !planetByPr.has(prId)) planetByPr.set(prId, planet);
      }
    }

    if (sourceResults.length) {
      const columns = sourceResults[0].columns;
      for (const values of sourceResults[0].values) {
        const source: any = {};
        columns.forEach((column, index) => {
          source[column] = values[index];
        });

        const prId = Number(source.pr_id);
        const docId = `canon_pr_${prId}`;
        const planetName = planetByPr.get(prId) || 'Federation';
        const content = String(source.content || '');

        db.run(
          `INSERT OR REPLACE INTO canon_nodes (id, name, type, planet, faction, description, metadata_json, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            docId,
            source.title || `GitHub PR #${prId}`,
            'source_lore',
            planetName,
            '',
            content ? content.slice(0, 350) + (content.length > 350 ? '...' : '') : '',
            JSON.stringify({
              source: 'github_pr',
              author: source.author || '',
              full_content: content,
              length: content.length,
              pr_id: prId,
              pr_url: source.pr_url || `https://github.com/Alien-Worlds/the-lore/pull/${prId}`,
              file_path: source.file_path || '',
              source_kind: source.source_kind || '',
              content_sha256: source.content_sha256 || '',
              resolution_status: source.resolution_status || ''
            }),
            now
          ]
        );
        nodeCount++;

        const planetNodeId = PLANET_IDS.get(planetName.toLowerCase());
        if (planetNodeId) {
          db.run(
            `INSERT OR REPLACE INTO canon_edges (id, source, target, relation, weight, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              `edge_pr_${prId}_${planetNodeId}`,
              docId,
              planetNodeId,
              'primary_setting',
              1.0,
              now
            ]
          );
          edgeCount++;
        }
      }
    }
  } catch (err) {
    console.warn('Error ingesting resolved GitHub sources into canon nodes:', err);
  }

  persistDatabase();
  return { nodes: nodeCount, edges: edgeCount };
}
