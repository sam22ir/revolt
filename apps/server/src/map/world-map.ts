import { DurableObject } from "cloudflare:workers";
import type { HeroLoadout, MapPoint, MapSnapshot, Troops } from "@revolt/rules";
import type { Env } from "../env.ts";
import { MapHost, type MapSocket } from "./map-host.ts";
import { MapService, type HqResult, type MapViewer, type SendMarchResult } from "./map-service.ts";

/** The subprotocol a map client asks for; the 101 answer must echo it. */
export const MAP_PROTOCOL = "revolt.v1";

/**
 * One server's world map (GDD §4.5) as a SQLite-backed Durable Object.
 *
 * One object per map rather than per region: marches cross regions and contested NPCs need a
 * single order of events, and an M3 map (64×64, hundreds of players) is far below what one
 * object handles. Splitting by region is the scale path if needed (GDD §12).
 *
 * The Worker calls it over RPC with its own `now`; only `alarm()` reads this object's clock.
 * Clients connect with hibernatable WebSockets tagged with their account id.
 */
export class WorldMap extends DurableObject<Env> {
  private host: MapHost | null = null;

  /** Game time for alarms. The e2e build overrides it with a settable clock. */
  protected async clock(): Promise<number> {
    return Date.now();
  }

  private mapHost(): MapHost {
    if (this.host !== null) return this.host;
    const service = new MapService({
      sql: { exec: (q, ...b) => this.ctx.storage.sql.exec(q, ...b).toArray() as never },
      db: this.env.DB,
      random: Math.random,
      newId: () => crypto.randomUUID(),
    });
    this.host = new MapHost(service, {
      sockets: () => this.sockets(),
      setAlarm: (at) => (at === null ? this.ctx.storage.deleteAlarm() : this.ctx.storage.setAlarm(at)),
      realNow: () => Date.now(),
    });
    return this.host;
  }

  private *sockets(): Iterable<MapSocket> {
    for (const ws of this.ctx.getWebSockets()) {
      const accountId = this.ctx.getTags(ws)[0];
      if (accountId !== undefined) yield { accountId, send: (d) => ws.send(d) };
    }
  }

  async view(map: string, viewer: MapViewer, now: number): Promise<MapSnapshot> {
    return this.mapHost().run(now, (s) => {
      s.rememberName(map);
      return s.view(viewer, now);
    });
  }

  async sendMarch(map: string, viewer: MapViewer, npcId: string, troops: Troops, heroes: HeroLoadout | null, now: number): Promise<SendMarchResult> {
    return this.mapHost().run(now, (s) => {
      s.rememberName(map);
      return s.sendMarch(viewer, npcId, troops, heroes, now);
    });
  }

  async startRally(map: string, viewer: MapViewer, npcId: string, troops: Troops, gatherMs: number, now: number): Promise<SendMarchResult> {
    return this.mapHost().run(now, (s) => {
      s.rememberName(map);
      return s.startRally(viewer, npcId, troops, gatherMs, now);
    });
  }

  async joinRally(map: string, viewer: MapViewer, rallyId: string, troops: Troops, now: number): Promise<SendMarchResult> {
    return this.mapHost().run(now, (s) => {
      s.rememberName(map);
      return s.joinRally(viewer, rallyId, troops, now);
    });
  }

  async setHq(map: string, viewer: MapViewer, x: number, y: number, now: number): Promise<HqResult> {
    return this.mapHost().run(now, (s) => {
      s.rememberName(map);
      return s.setHq(viewer, x, y, now);
    });
  }

  async hqOf(_map: string, allianceId: string): Promise<MapPoint | null> {
    return this.mapHost().service.hqOf(allianceId);
  }

  async hqAllianceIds(_map: string): Promise<string[]> {
    return this.mapHost().service.hqAllianceIds();
  }

  async setAlliance(_map: string, viewer: MapViewer, now: number): Promise<void> {
    await this.mapHost().run(now, (s) => s.setAlliance(viewer));
  }

  async removeAlliance(_map: string, allianceId: string, now: number): Promise<void> {
    await this.mapHost().run(now, (s) => s.removeAlliance(allianceId));
  }

  async removeAccounts(ids: string[], now: number): Promise<number> {
    return this.mapHost().run(now, (s) => s.removeAccounts(ids));
  }

  /** WebSocket upgrade, already authenticated by the Worker (`x-account-id`, `x-map`, `x-now`). */
  override async fetch(req: Request): Promise<Response> {
    const accountId = req.headers.get("x-account-id");
    const handle = req.headers.get("x-handle");
    const map = req.headers.get("x-map");
    const now = Number(req.headers.get("x-now"));
    if (req.headers.get("upgrade")?.toLowerCase() !== "websocket" || accountId === null || handle === null || map === null || !Number.isFinite(now)) {
      return new Response(null, { status: 400 });
    }
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server, [accountId]);
    // Places the base if needed. Others hear of a new base through the push; this socket gets its snapshot here.
    const viewer: MapViewer = { accountId, handle, allianceId: req.headers.get("x-alliance-id") || null, allianceTag: req.headers.get("x-alliance-tag") || null };
    const snapshot = await this.view(map, viewer, now);
    server.send(JSON.stringify({ type: "map", snapshot }));
    return new Response(null, { status: 101, webSocket: client, headers: { "sec-websocket-protocol": MAP_PROTOCOL } });
  }

  override async alarm(): Promise<void> {
    try {
      await this.mapHost().wake(await this.clock());
    } catch (e) {
      // Never let the runtime retry blindly; try again shortly.
      console.error("map alarm failed", e);
      await this.ctx.storage.setAlarm(Date.now() + 5000);
    }
  }

  override webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    if (message === "ping") ws.send("pong");
  }

  override webSocketClose(ws: WebSocket): void {
    try {
      ws.close(1000, "closed");
    } catch {
      // Already closed.
    }
  }
}
