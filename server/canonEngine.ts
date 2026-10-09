import { getDatabase, persistDatabase } from "./db";
import { syncWaxProposals } from "./waxIngester";
import { syncGitHubCanon } from "./githubIngester";

export class CanonEngine {
  private static instance: CanonEngine;
  private isSyncing = false;
  private syncInterval: NodeJS.Timeout | null = null;

  private constructor() {}

  public static getInstance(): CanonEngine {
    if (!CanonEngine.instance) {
      CanonEngine.instance = new CanonEngine();
    }
    return CanonEngine.instance;
  }

  public async startSyncDaemon(intervalMs = 60000) {
    console.log("[CanonEngine] Initializing ingestion daemon...");
    await this.runSyncCycle();

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(() => {
      this.runSyncCycle().catch((err) => {
        console.error("[CanonEngine] Background sync error:", err);
      });
    }, intervalMs);
  }

  public async runSyncCycle() {
    if (this.isSyncing) return { status: "already_running" };
    this.isSyncing = true;
    console.log("[CanonEngine] Executing synchronization cycle across WAX & GitHub...");
    try {
      const waxCount = await syncWaxProposals();
      const ghStats = await syncGitHubCanon();
      console.log(`[CanonEngine] Sync cycle completed: ${waxCount} proposals, ${ghStats.nodes} canon nodes, ${ghStats.edges} edges.`);
      return {
        status: "success",
        timestamp: Date.now(),
        indexed_proposals: waxCount,
        canon_nodes: ghStats.nodes,
        canon_edges: ghStats.edges
      };
    } catch (error) {
      console.error("[CanonEngine] Sync cycle error:", error);
      return { status: "error", error: String(error) };
    } finally {
      this.isSyncing = false;
    }
  }

  public async getProposals(filter?: { status?: string; proposer?: string; planet?: string; query?: string }) {
    const db = await getDatabase();
    let sql = `
      SELECT 
        p.id,
        p.proposal_id,
        p.proposer,
        p.title,
        substr(p.content, 1, 400) AS content,
        length(p.content) AS full_length,
        0 AS content_complete,
        p.ipfs_cid,
        p.status,
        p.status_label,
        p.votes_for,
        p.votes_against,
        p.threshold,
        p.planet,
        p.created_at,
        p.updated_at,
        p.tx_id,
        p.source_url,
        p.pull_request_id,
        g.resolution_status AS narrative_source_status,
        g.resolution_reason AS narrative_source_reason,
        g.file_path AS narrative_source_path,
        g.content_sha256 AS narrative_source_sha256,
        g.title AS narrative_title,
        g.author AS narrative_author,
        substr(g.content, 1, 1200) AS narrative_content,
        length(g.content) AS narrative_full_length
      FROM proposals p
      LEFT JOIN github_pr_sources g ON g.pr_id = p.pull_request_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filter?.status && filter.status !== "all") {
      sql += " AND (p.status_label = ? OR p.status = ?)";
      params.push(filter.status, filter.status);
    }
    if (filter?.proposer) {
      sql += " AND p.proposer = ?";
      params.push(filter.proposer);
    }
    if (filter?.planet && filter.planet !== "All") {
      sql += " AND p.planet = ?";
      params.push(filter.planet);
    }
    if (filter?.query) {
      sql += " AND (p.title LIKE ? OR p.content LIKE ? OR g.title LIKE ? OR g.content LIKE ?)";
      params.push(`%${filter.query}%`, `%${filter.query}%`, `%${filter.query}%`, `%${filter.query}%`);
    }

    sql += " ORDER BY p.proposal_id DESC LIMIT 500";

    const results = db.exec(sql, params);
    if (!results.length) return [];

    const columns = results[0].columns;
    return results[0].values.map((row) => {
      const obj: any = {};
      columns.forEach((col, i) => {
        obj[col] = row[i];
      });
      return obj;
    });
  }

  public async getProposalById(id: string | number) {
    const db = await getDatabase();
    const results = db.exec(
      `SELECT p.*, 1 AS content_complete,
              g.resolution_status AS narrative_source_status,
              g.resolution_reason AS narrative_source_reason,
              g.file_path AS narrative_source_path,
              g.content_sha256 AS narrative_source_sha256,
              g.title AS narrative_title,
              g.author AS narrative_author,
              g.content AS narrative_content
       FROM proposals p
       LEFT JOIN github_pr_sources g ON g.pr_id = p.pull_request_id
       WHERE p.id = ? OR p.proposal_id = ?
       LIMIT 1`,
      [String(id), Number(id) || 0]
    );
    if (!results.length) return null;
    const columns = results[0].columns;
    const row = results[0].values[0];
    const obj: any = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  }

  public async getTelemetry() {
    const db = await getDatabase();
    const results = db.exec("SELECT metric_value FROM governance_telemetry WHERE metric_key = 'governance_summary' LIMIT 1");
    if (results.length && results[0].values.length) {
      try {
        return JSON.parse(String(results[0].values[0][0]));
      } catch (e) {
        // fallback
      }
    }
    return {
      total_proposals: 0,
      active_proposals: 0,
      passed_proposals: 0,
      active_scribes: 0,
      pass_rate_pct: 0,
      chain: "WAX Mainnet",
      contract: "lore.worlds",
      table: "tokelores",
      status: "NO_DATA"
    };
  }

  public async getCanonGraph() {
    const db = await getDatabase();
    const nodeResults = db.exec("SELECT * FROM canon_nodes");
    const edgeResults = db.exec("SELECT * FROM canon_edges");

    const nodes = nodeResults.length
      ? nodeResults[0].values.map((row) => {
          const node: any = {};
          nodeResults[0].columns.forEach((col, i) => {
            node[col] = row[i];
          });
          return {
            id: node.id,
            name: node.name,
            type: node.type,
            planet: node.planet,
            faction: node.faction,
            description: node.description
          };
        })
      : [];

    const edges = edgeResults.length
      ? edgeResults[0].values.map((row) => {
          const edge: any = {};
          edgeResults[0].columns.forEach((col, i) => {
            edge[col] = row[i];
          });
          return {
            source: edge.source,
            target: edge.target,
            relation: edge.relation,
            weight: edge.weight
          };
        })
      : [];

    return { nodes, links: edges };
  }

  public async getRecentEvents(limit = 50) {
    const db = await getDatabase();
    const results = db.exec("SELECT * FROM hyperion_actions ORDER BY block_num DESC LIMIT ?", [limit]);
    if (!results.length) return [];
    const columns = results[0].columns;
    return results[0].values.map((row) => {
      const obj: any = {};
      columns.forEach((col, i) => {
        obj[col] = row[i];
      });
      try {
        obj.data = JSON.parse(obj.data_json);
      } catch (e) {
        obj.data = {};
      }
      return obj;
    });
  }

  public async getPlanetaryMetrics() {
    const db = await getDatabase();
    const results = db.exec("SELECT * FROM planetary_metrics ORDER BY planet_name ASC");
    if (!results.length) return [];
    const columns = results[0].columns;
    return results[0].values.map((row) => {
      const obj: any = {};
      columns.forEach((col, i) => {
        obj[col] = row[i];
      });
      return obj;
    });
  }

  public async recordAnalyticsEvent(event: {
    eventType: string;
    path?: string;
    planet?: string;
    loreId?: string;
    loreTitle?: string;
    userId?: string;
    sessionId?: string;
    durationMs?: number;
    metadata?: any;
  }) {
    const db = await getDatabase();
    const id = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = Date.now();
    const metadataJson = JSON.stringify(event.metadata || {});

    db.run(
      `INSERT INTO analytics_events (
        id, event_type, path, planet, lore_id, lore_title, user_id, session_id, duration_ms, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        event.eventType,
        event.path || null,
        event.planet || null,
        event.loreId || null,
        event.loreTitle || null,
        event.userId || null,
        event.sessionId || null,
        event.durationMs || 0,
        metadataJson,
        now
      ]
    );

    // Also record page view if it's a view event
    if (event.eventType === 'page_view' || event.eventType === 'route_change') {
      const pvId = `pv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      db.run(
        `INSERT INTO page_views (id, route, view_name, planet, user_id, session_id, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          pvId,
          event.path || '/',
          event.metadata?.viewName || event.path || 'unknown',
          event.planet || null,
          event.userId || null,
          event.sessionId || null,
          now
        ]
      );
    }

    persistDatabase();
    return { success: true, id };
  }

  public async getAnalyticsSummary() {
    const db = await getDatabase();
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    // Total page views
    const totalPvRes = db.exec("SELECT COUNT(*) FROM page_views");
    const totalPageViews = totalPvRes.length && totalPvRes[0].values.length ? Number(totalPvRes[0].values[0][0]) : 0;

    // 24h page views
    const pv24Res = db.exec("SELECT COUNT(*) FROM page_views WHERE timestamp >= ?", [oneDayAgo]);
    const pageViews24h = pv24Res.length && pv24Res[0].values.length ? Number(pv24Res[0].values[0][0]) : 0;

    // Unique sessions
    const sessRes = db.exec("SELECT COUNT(DISTINCT session_id) FROM page_views");
    const uniqueSessions = sessRes.length && sessRes[0].values.length ? Number(sessRes[0].values[0][0]) : 0;

    // Total lore read events & total duration
    const loreRes = db.exec("SELECT COUNT(*), SUM(duration_ms) FROM analytics_events WHERE event_type = 'lore_read' OR lore_id IS NOT NULL");
    const totalLoreReads = loreRes.length && loreRes[0].values.length ? Number(loreRes[0].values[0][0] || 0) : 0;
    const totalLoreDurationMs = loreRes.length && loreRes[0].values.length ? Number(loreRes[0].values[0][1] || 0) : 0;

    // Interactive events (votes, search, bounties, comments)
    const interactRes = db.exec("SELECT COUNT(*) FROM analytics_events WHERE event_type IN ('vote', 'comment', 'bounty_claim', 'search', 'graph_inspect')");
    const totalInteractions = interactRes.length && interactRes[0].values.length ? Number(interactRes[0].values[0][0]) : 0;

    // Top planets visited
    const planetViewsRes = db.exec(`
      SELECT planet, COUNT(*) as visit_count 
      FROM page_views 
      WHERE planet IS NOT NULL AND planet != ''
      GROUP BY planet 
      ORDER BY visit_count DESC 
      LIMIT 10
    `);
    const topPlanets = planetViewsRes.length
      ? planetViewsRes[0].values.map((row) => ({
          planet: String(row[0]),
          visits: Number(row[1])
        }))
      : [];

    // Top read lore
    const topLoreRes = db.exec(`
      SELECT lore_id, lore_title, COUNT(*) as read_count, AVG(duration_ms) as avg_dwell_ms
      FROM analytics_events 
      WHERE lore_id IS NOT NULL AND lore_id != ''
      GROUP BY lore_id 
      ORDER BY read_count DESC 
      LIMIT 10
    `);
    const topLoreEntries = topLoreRes.length
      ? topLoreRes[0].values.map((row) => ({
          loreId: String(row[0]),
          title: String(row[1] || 'Transmitted Chapter'),
          reads: Number(row[2]),
          avgDwellSeconds: Math.round(Number(row[3] || 0) / 1000)
        }))
      : [];

    // Top routes/views
    const topRoutesRes = db.exec(`
      SELECT view_name, COUNT(*) as count 
      FROM page_views 
      GROUP BY view_name 
      ORDER BY count DESC 
      LIMIT 10
    `);
    const topRoutes = topRoutesRes.length
      ? topRoutesRes[0].values.map((row) => ({
          view: String(row[0]),
          count: Number(row[1])
        }))
      : [];

    // Recent 24h hourly distribution
    const hourlyRes = db.exec(`
      SELECT strftime('%H:00', datetime(timestamp/1000, 'unixepoch')) as hour_slot, COUNT(*) as count
      FROM page_views
      WHERE timestamp >= ?
      GROUP BY hour_slot
      ORDER BY timestamp ASC
    `, [oneDayAgo]);
    const hourlyTraffic = hourlyRes.length
      ? hourlyRes[0].values.map((row) => ({
          hour: String(row[0]),
          views: Number(row[1])
        }))
      : [];

    // Coarse returning-session retention: a session must appear on at least two
    // distinct UTC dates. This replaces the old synthetic multiplier-based value.
    const returningRes = db.exec(`
      SELECT COUNT(*) FROM (
        SELECT session_id
        FROM page_views
        WHERE session_id IS NOT NULL AND session_id != ''
        GROUP BY session_id
        HAVING COUNT(DISTINCT date(timestamp/1000, 'unixepoch')) >= 2
      )
    `);
    const returningSessions = returningRes.length && returningRes[0].values.length
      ? Number(returningRes[0].values[0][0] || 0)
      : 0;

    return {
      overview: {
        totalPageViews,
        pageViews24h,
        uniqueSessions,
        totalLoreReads,
        totalLoreDurationMinutes: Math.round(totalLoreDurationMs / 60000),
        totalInteractions,
        retentionRatePct: uniqueSessions > 0 ? Math.round((returningSessions / uniqueSessions) * 100) : 0
      },
      topPlanets,
      topLoreEntries,
      topRoutes,
      hourlyTraffic,
      generatedAt: now
    };
  }

  public async getRecentAnalyticsEvents(limit = 40) {
    const db = await getDatabase();
    const results = db.exec("SELECT * FROM analytics_events ORDER BY created_at DESC LIMIT ?", [limit]);
    if (!results.length) return [];
    const columns = results[0].columns;
    return results[0].values.map((row) => {
      const obj: any = {};
      columns.forEach((col, i) => {
        obj[col] = row[i];
      });
      try {
        obj.metadata = JSON.parse(obj.metadata_json);
      } catch (e) {
        obj.metadata = {};
      }
      // This endpoint is consumed by the admin UI but is not backed by a
      // server-side application token verifier. Never expose raw user/session IDs.
      delete obj.user_id;
      delete obj.session_id;
      delete obj.metadata_json;
      return obj;
    });
  }
}
