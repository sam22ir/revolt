import type { MapServerMessage, MapSnapshot } from "@revolt/rules";
import type { MapEvent, MapOp, MapService } from "./map-service.ts";

/** One connected client. */
export interface MapSocket {
  readonly accountId: string;
  send(data: string): void;
}

/** What the host needs from its runtime: the open sockets and a real-time alarm. */
export interface MapPorts {
  sockets(): Iterable<MapSocket>;
  /** Schedules the next wake-up at a real (wall-clock) time, or clears it. */
  setAlarm(realAt: number | null): Promise<void>;
  realNow(): number;
}

/** Wake-ups are never closer than this, so a game clock behind real time cannot spin the alarm. */
export const MIN_ALARM_DELAY_MS = 1000;

/**
 * Runs map operations one at a time (D1 awaits would otherwise let them interleave),
 * settles the map first, pushes what changed to connected clients, and re-arms the alarm.
 * Shared by the Durable Object and the tests, so both exercise the same path.
 */
export class MapHost {
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    readonly service: MapService,
    private readonly ports: MapPorts,
  ) {}

  run<T>(now: number, op: (s: MapService) => MapOp<T> | Promise<MapOp<T>>): Promise<T> {
    const work = async (): Promise<T> => {
      const settled = await this.service.settle(now);
      const r = await op(this.service);
      this.deliver([...settled, ...r.events], now);
      await this.reschedule(now);
      return r.value;
    };
    const p = this.chain.then(work);
    this.chain = p.catch(() => undefined);
    return p;
  }

  /** The alarm: resolve whatever is due at game time `now`. */
  wake(now: number): Promise<void> {
    return this.run(now, () => ({ value: undefined, events: [] }));
  }

  private deliver(events: readonly MapEvent[], now: number): void {
    if (events.length === 0) return;
    const mapChanged = events.some((e) => e.type === "map_changed");
    const snapshots = new Map<string, MapSnapshot>();
    for (const socket of this.ports.sockets()) {
      const out: MapServerMessage[] = [];
      for (const e of events) {
        if (e.type === "report" && e.accountId === socket.accountId) out.push({ type: "report", report: e.report });
        if (e.type === "base_changed" && e.accountId === socket.accountId) out.push({ type: "base_changed", now });
      }
      if (mapChanged) {
        let snapshot = snapshots.get(socket.accountId);
        if (snapshot === undefined) {
          snapshot = this.service.snapshot(socket.accountId, now);
          snapshots.set(socket.accountId, snapshot);
        }
        out.unshift({ type: "map", snapshot });
      }
      // De-duplicate base_changed: one re-fetch is enough.
      const seen = new Set<string>();
      for (const msg of out) {
        const key = msg.type === "report" ? `report:${msg.report.id}` : msg.type;
        if (seen.has(key)) continue;
        seen.add(key);
        try {
          socket.send(JSON.stringify(msg));
        } catch {
          // A socket closing mid-send is dropped; the client reconnects and gets a fresh snapshot.
        }
      }
    }
  }

  private async reschedule(now: number): Promise<void> {
    const due = this.service.nextDueAt();
    await this.ports.setAlarm(due === null ? null : this.ports.realNow() + Math.max(MIN_ALARM_DELAY_MS, due - now));
  }
}
