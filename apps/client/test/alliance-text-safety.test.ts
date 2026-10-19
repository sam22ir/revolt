import type { AllianceView, ChatMessage, HelpRequestView, RallyView } from "@revolt/rules";
import { beforeAll, describe, expect, test } from "vitest";
import { initI18n } from "../src/i18n/i18n.ts";
import { createAllianceHelp } from "../src/ui/alliance-help.ts";
import { createAllianceMembers } from "../src/ui/alliance-members.ts";
import { createAllianceRallies } from "../src/ui/alliance-rallies.ts";
import { allianceResultRow, chatMessageRow } from "../src/ui/alliance-rows.ts";
import type { AllianceStore } from "../src/state/alliance-store.ts";
import type { ConfirmDialog } from "../src/ui/confirm-dialog.ts";

/*
 * The client has no DOM test library (no jsdom or happy-dom is installed), so this is a small stand-in for
 * `document`: it records every element created, keeps text and attributes, and throws on `innerHTML`.
 * If a builder turned player text into markup, an `<img>` would be created or the setter would throw.
 */

class FakeNode {
  className = "";
  hidden = false;
  disabled = false;
  type = "";
  readonly dataset: Record<string, string> = {};
  readonly attrs: Record<string, string> = {};
  readonly children: (FakeNode | string)[] = [];
  private own = "";
  constructor(readonly tagName: string) {}
  get textContent(): string {
    return this.own + this.children.map((c) => (typeof c === "string" ? c : c.textContent)).join("");
  }
  set textContent(v: string) {
    this.own = v;
    this.children.length = 0;
  }
  set innerHTML(_v: string) {
    throw new Error("innerHTML was assigned");
  }
  setAttribute(k: string, v: string): void {
    this.attrs[k] = v;
  }
  getAttribute(k: string): string | null {
    return this.attrs[k] ?? null;
  }
  append(...nodes: (FakeNode | string)[]): void {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes: (FakeNode | string)[]): void {
    this.own = "";
    this.children.length = 0;
    this.children.push(...nodes);
  }
  addEventListener(): void {}
  remove(): void {}
  /** Every descendant element, depth first. */
  all(): FakeNode[] {
    return this.children.flatMap((c) => (typeof c === "string" ? [] : [c, ...c.all()]));
  }
}

const created: FakeNode[] = [];
const fakeDocument = {
  createElement: (tag: string): FakeNode => {
    const n = new FakeNode(tag);
    created.push(n);
    return n;
  },
  documentElement: { lang: "", dir: "" },
  title: "",
};

const HOSTILE = '<img src=x onerror="alert(1)">';
const asNode = (e: unknown): FakeNode => e as FakeNode;

const expectInert = (): void => {
  const bad = created.filter((n) => ["img", "script", "iframe", "svg", "style", "a"].includes(n.tagName));
  expect(bad.map((n) => n.tagName)).toEqual([]);
};

const textNodes = (root: FakeNode, text: string): FakeNode[] => [root, ...root.all()].filter((n) => n.textContent === text);

beforeAll(async () => {
  Object.defineProperty(globalThis, "document", { value: fakeDocument, configurable: true });
  await initI18n("en");
});

describe("player-written text never becomes markup", () => {
  test("a chat message with HTML in its text and handle is plain text with dir=auto", () => {
    created.length = 0;
    const msg: ChatMessage = { id: 1, at: Date.UTC(2026, 9, 1, 12, 0), handle: HOSTILE, rank: "officer", text: HOSTILE };
    const row = asNode(chatMessageRow(msg, "ME2345", "en"));
    expectInert();
    const holders = textNodes(row, HOSTILE);
    expect(holders.length).toBeGreaterThanOrEqual(2);
    for (const h of holders) expect(h.attrs.dir).toBe("auto");
    expect(row.dataset.mine).toBe("0");
  });

  test("own messages are marked, and an Arabic line keeps its text exactly", () => {
    created.length = 0;
    const text = "مرحبا بالجميع";
    const row = asNode(chatMessageRow({ id: 2, at: 0, handle: "ME2345", rank: "member", text }, "ME2345", "ar"));
    expect(row.dataset.mine).toBe("1");
    expect(row.className).toContain("mine");
    expect(textNodes(row, text)[0]?.attrs.dir).toBe("auto");
  });

  test("an alliance with HTML in its name and tag, in the search results", () => {
    created.length = 0;
    const { li } = allianceResultRow({ id: "a1", name: HOSTILE, tag: HOSTILE, members: 3, maxMembers: 30 }, "en");
    expectInert();
    const holders = textNodes(asNode(li), HOSTILE);
    expect(holders).toHaveLength(2);
    for (const h of holders) expect(h.attrs.dir).toBe("auto");
  });

  test("the members tab: alliance name, tag and member handles", () => {
    created.length = 0;
    const alliance: AllianceView = {
      id: "a1",
      name: HOSTILE,
      tag: "LF",
      myRank: "leader",
      members: [
        { handle: "ME2345", rank: "leader", joinedAt: 0, me: true },
        { handle: HOSTILE, rank: "member", joinedAt: 1, me: false },
      ],
      maxMembers: 30,
      hq: null,
    };
    const store = {} as unknown as AllianceStore;
    const confirm = { root: {}, ask: async () => false } as unknown as ConfirmDialog;
    const members = createAllianceMembers({ store, confirm, onError: () => {} });
    members.update(alliance);
    expectInert();
    const root = asNode(members.root);
    expect(textNodes(root, HOSTILE).length).toBeGreaterThanOrEqual(2);
    for (const h of textNodes(root, HOSTILE)) expect(h.attrs.dir).toBe("auto");
    // The kick button for the hostile handle exists, addressed by a plain dataset value.
    expect(root.all().some((n) => n.dataset.testid === `member-kick-${HOSTILE}`)).toBe(true);
  });

  test("help requests and rallies show handles as text", () => {
    created.length = 0;
    const request: HelpRequestView = { id: "h1", handle: HOSTILE, kind: "upgrade", endsAt: 10_000, helps: 0, maxHelps: 5, mine: false, helped: false };
    const help = createAllianceHelp({ store: {} as unknown as AllianceStore, onError: () => {} });
    help.update([request], 0);
    const rally: RallyView = {
      id: "r1",
      leader: HOSTILE,
      target: { npcId: "n1", kind: "outpost", level: 3, x: 1, y: 2 },
      gatherUntil: 10_000,
      arriveAt: 20_000,
      returnAt: 30_000,
      participants: 1,
      maxParticipants: 10,
      joined: false,
    };
    const rallies = createAllianceRallies({ onJoin: () => {} });
    rallies.update([rally], 0);
    expectInert();
    expect(textNodes(asNode(help.root), HOSTILE)[0]?.attrs.dir).toBe("auto");
    expect(textNodes(asNode(rallies.root), HOSTILE)[0]?.attrs.dir).toBe("auto");
  });
});

describe("the alliance UI source", () => {
  const sources = import.meta.glob(["../src/ui/alliance-*.ts", "../src/ui/confirm-dialog.ts", "../src/ui/tile-panel.ts", "../src/ui/march-dialog.ts"], {
    query: "?raw",
    import: "default",
    eager: true,
  });

  test("never assigns innerHTML or inserts adjacent HTML", () => {
    const files = Object.entries(sources);
    expect(files.length).toBeGreaterThanOrEqual(8);
    for (const [name, code] of files) {
      // Comments may say "never innerHTML"; the code may not use it.
      const code2 = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(code2, name).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
    }
  });

  test("never draws alliance text in Phaser, except the checked ASCII tag", async () => {
    const scene = Object.entries(import.meta.glob("../src/scene/world-scene.ts", { query: "?raw", import: "default", eager: true }));
    expect(scene).toHaveLength(1);
    const code = String(scene[0]?.[1]);
    // The only `setText` calls take an NPC level or a tag that passed `drawableTag`.
    const all = code.match(/\.setText\(/g) ?? [];
    const allowed = code.match(/\.setText\((String\(n\.level\)|tag)\)/g) ?? [];
    expect(all).toHaveLength(2);
    expect(allowed).toHaveLength(2);
    expect(code).toContain("drawableTag(h.tag)");
    expect(code).not.toMatch(/alliance\.name|\.leader|\.handle/);
  });
});
