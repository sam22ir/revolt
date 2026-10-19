import type { AllianceBlockReason, AllianceListItem, AllianceView, ChatMessage, HelpKind, HelpRequestView } from "@revolt/rules";
import type { AccountView, Api, HelpReply, MemberAction } from "../net/api.ts";
import type { AllianceSocket } from "../net/alliance-socket.ts";

/** The most chat lines kept in memory; the server keeps 100, so this covers a few reconnects. */
export const MAX_MESSAGES = 200;

/** What the server (or the network) said to an alliance action. */
export type AllianceOutcome = { readonly ok: true } | { readonly ok: false; readonly reason: AllianceBlockReason | "unreachable" };

export type ChatError = "rate_limited" | "bad_text";

export interface AllianceStore {
  /** The player's alliance, or null (also before the first answer). */
  readonly alliance: () => AllianceView | null;
  /** Open help requests of the members, own included. Some may have run out since: compare `endsAt` with `now`. */
  readonly help: () => readonly HelpRequestView[];
  /** Oldest first, ordered by id. */
  readonly messages: () => readonly ChatMessage[];
  /** Messages from others that arrived since the chat was last open. */
  readonly unread: () => number;
  /** Whether the chat socket is open. */
  readonly connected: () => boolean;
  /** Whether the first answer about the player's alliance has arrived. */
  readonly loaded: () => boolean;
  /** The player's open request of this kind, if any. */
  readonly ownRequest: (kind: HelpKind, now: number) => HelpRequestView | null;
  /** While the chat is on screen, new messages count as read. */
  readonly setChatOpen: (open: boolean) => void;
  /** Loads the player's alliance (and opens the socket if there is one). Safe to call once. */
  readonly start: () => void;
  readonly refresh: () => Promise<void>;
  /** Null when the server could not be reached. */
  readonly search: (q: string) => Promise<readonly AllianceListItem[] | null>;
  readonly create: (name: string, tag: string) => Promise<AllianceOutcome>;
  readonly join: (id: string) => Promise<AllianceOutcome>;
  readonly leave: () => Promise<AllianceOutcome>;
  readonly memberAction: (action: MemberAction, handle: string) => Promise<AllianceOutcome>;
  readonly placeHq: (x: number, y: number) => Promise<AllianceOutcome>;
  readonly requestHelp: (kind: HelpKind) => Promise<AllianceOutcome>;
  readonly giveHelp: (requestId: string) => Promise<AllianceOutcome>;
  /** False when the socket is not open. The server's verdict on the text arrives through `onChatError`. */
  readonly sendChat: (text: string) => boolean;
  readonly onChatError: (fn: (error: ChatError) => void) => () => void;
  readonly subscribe: (fn: () => void) => () => void;
}

interface AllianceDeps {
  readonly api: Api;
  readonly game: {
    readonly token: () => string;
    readonly account: () => AccountView;
    readonly resync: () => Promise<void>;
    readonly onSessionChange: (fn: () => void) => () => void;
  };
  readonly socket: AllianceSocket;
}

/** Merges by id, oldest first, keeping the newest `MAX_MESSAGES`. */
export const mergeMessages = (current: readonly ChatMessage[], incoming: readonly ChatMessage[]): ChatMessage[] => {
  const byId = new Map<number, ChatMessage>();
  for (const m of [...current, ...incoming]) byId.set(m.id, m);
  const all = [...byId.values()].sort((a, b) => a.id - b.id);
  return all.length > MAX_MESSAGES ? all.slice(all.length - MAX_MESSAGES) : all;
};

const replaceById = (list: readonly HelpRequestView[], request: HelpRequestView): HelpRequestView[] =>
  list.some((r) => r.id === request.id) ? list.map((r) => (r.id === request.id ? request : r)) : [...list, request];

/**
 * The player's alliance as this client knows it: members, help requests and chat. The chat socket is open
 * only while the player is in an alliance (the server refuses it otherwise), and a refetch of
 * `GET /v1/alliance` follows every notice that something changed.
 */
export const createAllianceStore = ({ api, game, socket }: AllianceDeps): AllianceStore => {
  let alliance: AllianceView | null = null;
  let help: HelpRequestView[] = [];
  let messages: ChatMessage[] = [];
  let loaded = false;
  let started = false;
  let chatOpen = false;
  /** Highest message id the player has seen; null until the first history of this room arrives. */
  let seenId: number | null = null;
  /** Bumped when the world the answers belong to changes (another alliance or account), to drop late replies. */
  let epoch = 0;
  const listeners = new Set<() => void>();
  const errorListeners = new Set<(e: ChatError) => void>();

  const notify = (): void => {
    for (const fn of listeners) fn();
  };
  const topId = (): number => messages.reduce((m, x) => Math.max(m, x.id), 0);
  const markSeen = (): void => {
    seenId = Math.max(seenId ?? 0, topId());
  };

  const forgetRoom = (): void => {
    epoch++;
    help = [];
    messages = [];
    seenId = null;
  };

  /** Takes the server's word on membership. A different alliance (or none) is a different chat room. */
  const setAlliance = (next: AllianceView | null, nextHelp?: readonly HelpRequestView[]): void => {
    if ((alliance?.id ?? null) !== (next?.id ?? null)) forgetRoom();
    if (nextHelp !== undefined) help = [...nextHelp];
    alliance = next;
    if (next === null) socket.stop();
    else socket.start();
    notify();
  };

  const refresh = async (): Promise<void> => {
    const mine = epoch;
    try {
      const res = await api.getAlliance(game.token());
      if (mine !== epoch) return;
      loaded = true;
      setAlliance(res.alliance, res.help);
    } catch {
      // Offline: the next notice or reconnect asks again.
    }
  };

  socket.onConnection(() => notify());
  socket.onMessage((msg) => {
    switch (msg.type) {
      case "history": {
        messages = mergeMessages(messages, msg.messages);
        // The first history of a room is what the player missed before today; later ones follow a reconnect,
        // and whatever others said meanwhile counts as new.
        if (seenId === null || chatOpen) markSeen();
        notify();
        // A history arrives on every (re)connect, which is when this client may have missed a notice.
        void refresh();
        return;
      }
      case "chat":
        messages = mergeMessages(messages, [msg.message]);
        if (chatOpen) markSeen();
        notify();
        return;
      case "members_changed":
        void refresh();
        return;
      case "help_changed":
        // The notice does not say whose request was answered, and a help may have shortened our own job.
        void refresh();
        void game.resync();
        return;
      case "kicked":
        forgetRoom();
        alliance = null;
        socket.stop();
        notify();
        return;
      case "error":
        for (const fn of errorListeners) fn(msg.reason);
        return;
    }
  });

  game.onSessionChange(() => {
    // Another account has another alliance.
    forgetRoom();
    alliance = null;
    loaded = false;
    socket.stop();
    notify();
    void refresh();
  });

  const act = async (call: (token: string) => Promise<{ ok: true; alliance: AllianceView | null } | { ok: false; reason: AllianceBlockReason }>): Promise<AllianceOutcome> => {
    try {
      const res = await call(game.token());
      if (!res.ok) return { ok: false, reason: res.reason };
      setAlliance(res.alliance);
      // A new alliance comes with its help requests.
      void refresh();
      return { ok: true };
    } catch {
      return { ok: false, reason: "unreachable" };
    }
  };

  const helpCall = async (call: (token: string) => Promise<HelpReply>): Promise<AllianceOutcome> => {
    try {
      const res = await call(game.token());
      if (!res.ok) return { ok: false, reason: res.reason };
      help = replaceById(help, res.request);
      notify();
      return { ok: true };
    } catch {
      return { ok: false, reason: "unreachable" };
    }
  };

  return {
    alliance: () => alliance,
    help: () => help,
    messages: () => messages,
    unread: () => {
      const me = game.account().handle;
      const seen = seenId ?? 0;
      return messages.filter((m) => m.id > seen && m.handle !== me).length;
    },
    connected: () => socket.connected(),
    loaded: () => loaded,
    ownRequest: (kind, now) => help.find((r) => r.mine && r.kind === kind && r.endsAt > now) ?? null,
    setChatOpen: (open) => {
      // The panel calls this on every redraw, and a redraw follows every notice: only a change may notify.
      if (chatOpen === open) return;
      chatOpen = open;
      if (!open) return;
      const before = seenId;
      markSeen();
      if (seenId !== before) notify();
    },
    start: () => {
      if (started) return;
      started = true;
      void refresh();
    },
    refresh,
    search: async (q) => {
      try {
        return (await api.searchAlliances(game.token(), q)).alliances;
      } catch {
        return null;
      }
    },
    create: (name, tag) => act((token) => api.createAlliance(token, name, tag)),
    join: (id) => act((token) => api.joinAlliance(token, id)),
    leave: () => act((token) => api.leaveAlliance(token)),
    memberAction: (action, handle) => act((token) => api.memberAction(token, action, handle)),
    placeHq: (x, y) => act((token) => api.placeHq(token, x, y)),
    requestHelp: (kind) => helpCall((token) => api.requestHelp(token, kind)),
    giveHelp: (requestId) => helpCall((token) => api.giveHelp(token, requestId)),
    sendChat: (text) => socket.send(text),
    onChatError: (fn) => {
      errorListeners.add(fn);
      return () => errorListeners.delete(fn);
    },
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
};
