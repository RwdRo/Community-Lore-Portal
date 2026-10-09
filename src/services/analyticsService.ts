import {portalFetch as fetch} from './pagesRuntime';
import { auth } from './applicationClient';

// Session persistence
const getSessionId = (): string => {
  try {
    let sid = sessionStorage.getItem('aw_session_id');
    if (!sid) {
      sid = 'sess_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now().toString(36);
      sessionStorage.setItem('aw_session_id', sid);
    }
    return sid;
  } catch (e) {
    return 'sess_anon_' + Date.now();
  }
};

export interface AnalyticsSummary {
  overview: {
    totalPageViews: number;
    pageViews24h: number;
    uniqueSessions: number;
    totalLoreReads: number;
    totalLoreDurationMinutes: number;
    totalInteractions: number;
    retentionRatePct: number;
  };
  topPlanets: { planet: string; visits: number }[];
  topLoreEntries: { loreId: string; title: string; reads: number; avgDwellSeconds: number }[];
  topRoutes: { view: string; count: number }[];
  hourlyTraffic: { hour: string; views: number }[];
  generatedAt: number;
}

export interface LiveAnalyticsEvent {
  id: string;
  event_type: string;
  path?: string;
  planet?: string;
  lore_id?: string;
  lore_title?: string;
  user_id?: string;
  session_id?: string;
  duration_ms?: number;
  metadata?: any;
  created_at: number;
}

/**
 * Universal Non-blocking Event Tracking Dispatcher
 */
export async function trackEvent(params: {
  eventType: string;
  path?: string;
  planet?: string;
  loreId?: string;
  loreTitle?: string;
  durationMs?: number;
  metadata?: Record<string, any>;
}): Promise<void> {
  const sessionId = getSessionId();
  const userId = auth.currentUser?.uid || undefined;

  const payload = {
    eventType: params.eventType,
    path: params.path || window.location.pathname,
    planet: params.planet,
    loreId: params.loreId,
    loreTitle: params.loreTitle,
    userId,
    sessionId,
    durationMs: params.durationMs || 0,
    metadata: params.metadata || {}
  };

  // 1. Post to Express Server API (persists in SQLite)
  try {
    fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Loreworks': '1' },
      body: JSON.stringify(payload)
    }).catch(() => {});
  } catch (err) {}

  // Analytics has one authority: the local server ledger. Avoiding a
  // second community storage write prevents duplicated counts and divergent retention
  // metrics while keeping the public client free of analytics write access.

}

export function trackPageView(viewName: string, metadata?: Record<string, any>) {
  trackEvent({
    eventType: 'page_view',
    path: `/${viewName}`,
    metadata: { viewName, ...metadata }
  });
}

export function trackPlanetView(planetId: string, planetName?: string) {
  trackEvent({
    eventType: 'planet_view',
    path: `/planet/${planetId}`,
    planet: planetName || planetId,
    metadata: { planetId, planetName }
  });
}

export function trackLoreRead(loreId: string, loreTitle: string, planet?: string, durationMs?: number) {
  trackEvent({
    eventType: 'lore_read',
    path: `/lore/${loreId}`,
    loreId,
    loreTitle,
    planet,
    durationMs: durationMs || 5000,
    metadata: { loreId, loreTitle, planet }
  });
}

export function trackInteraction(interactionType: string, details?: Record<string, any>) {
  trackEvent({
    eventType: interactionType,
    metadata: details
  });
}

export async function fetchAnalyticsSummary(): Promise<AnalyticsSummary | null> {
  try {
    const res = await fetch('/api/analytics/summary');
    if (!res.ok) throw new Error('HTTP error ' + res.status);
    const data = await res.json();
    return data.data;
  } catch (e) {
    console.warn('Analytics summary fetch fallback:', e);
    return null;
  }
}

export async function fetchRecentAnalyticsEvents(limit = 40): Promise<LiveAnalyticsEvent[]> {
  try {
    const res = await fetch(`/api/analytics/events?limit=${limit}`);
    if (!res.ok) throw new Error('HTTP error ' + res.status);
    const data = await res.json();
    return data.data || [];
  } catch (e) {
    console.warn('Recent analytics events fetch fallback:', e);
    return [];
  }
}
