import { HANDLE_ALPHABET, HANDLE_LENGTH, serverFor, type BackgroundId } from "@revolt/rules";
import { isUniqueViolation, type Db, type DbStatement } from "./db.ts";

export interface Account {
  readonly id: string;
  readonly googleSub: string | null;
  readonly googleEmail: string | null;
  /** The map server this account plays on (GDD §5). */
  readonly server: string;
  /** The player's public name until players can choose one. Unique per server. */
  readonly handle: string;
}

interface AccountRow {
  readonly id: string;
  readonly google_sub: string | null;
  readonly google_email: string | null;
  readonly server: string;
  readonly handle: string;
}

const toAccount = (r: AccountRow): Account => ({ id: r.id, googleSub: r.google_sub, googleEmail: r.google_email, server: r.server, handle: r.handle });

/** The server of accounts that name no background (the column default from migration 0004). */
export const DEFAULT_SERVER = "algeria-1";

/** The server a new account of this background is created on (GDD §2.2). It is fixed for the account's life. */
export const newAccountServer = (background: BackgroundId): string => serverFor(background);

export const insertAccount = (
  db: Db,
  a: { id: string; handle: string; now: number; server?: string; googleSub?: string; googleEmail?: string | null; importedM1?: boolean },
): DbStatement =>
  db
    .prepare("INSERT INTO accounts (id, created_at, google_sub, google_email, imported_m1, handle, server) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(a.id, a.now, a.googleSub ?? null, a.googleEmail ?? null, a.importedM1 === true ? 1 : 0, a.handle, a.server ?? DEFAULT_SERVER);

/** A random handle from the tag alphabet (32^6, about a billion). */
export const newHandle = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(HANDLE_LENGTH));
  return [...bytes].map((b) => HANDLE_ALPHABET[b % HANDLE_ALPHABET.length]).join("");
};

/** True if the error is the handle index refusing a duplicate (as opposed to the Google id, say). */
export const isHandleCollision = (e: unknown): boolean => isUniqueViolation(e) && e instanceof Error && /handle/i.test(e.message);

/** Runs `attempt` with a fresh handle, again with another if that handle was already taken. */
export const withNewHandle = async <T>(attempt: (handle: string) => Promise<T>): Promise<T> => {
  for (let i = 0; ; i++) {
    try {
      return await attempt(newHandle());
    } catch (e) {
      if (!isHandleCollision(e) || i >= 5) throw e;
    }
  }
};

export const findAccountById = async (db: Db, id: string): Promise<Account | null> => {
  const r = await db.prepare("SELECT id, google_sub, google_email, server, handle FROM accounts WHERE id = ?").bind(id).first<AccountRow>();
  return r === null ? null : toAccount(r);
};

export const findAccountByGoogleSub = async (db: Db, sub: string): Promise<Account | null> => {
  const r = await db.prepare("SELECT id, google_sub, google_email, server, handle FROM accounts WHERE google_sub = ?").bind(sub).first<AccountRow>();
  return r === null ? null : toAccount(r);
};

/** Links Google to an account that has none yet. False if it was linked meanwhile. Throws on a taken `sub`. */
export const linkGoogle = async (db: Db, id: string, sub: string, email: string | null): Promise<boolean> => {
  const r = await db
    .prepare("UPDATE accounts SET google_sub = ?, google_email = ? WHERE id = ? AND google_sub IS NULL")
    .bind(sub, email, id)
    .run();
  return r.meta.changes === 1;
};
