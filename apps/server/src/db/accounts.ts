import type { Db, DbStatement } from "./db.ts";

export interface Account {
  readonly id: string;
  readonly googleSub: string | null;
  readonly googleEmail: string | null;
}

interface AccountRow {
  readonly id: string;
  readonly google_sub: string | null;
  readonly google_email: string | null;
}

const toAccount = (r: AccountRow): Account => ({ id: r.id, googleSub: r.google_sub, googleEmail: r.google_email });

export const insertAccount = (
  db: Db,
  a: { id: string; now: number; googleSub?: string; googleEmail?: string | null; importedM1?: boolean },
): DbStatement =>
  db
    .prepare("INSERT INTO accounts (id, created_at, google_sub, google_email, imported_m1) VALUES (?, ?, ?, ?, ?)")
    .bind(a.id, a.now, a.googleSub ?? null, a.googleEmail ?? null, a.importedM1 === true ? 1 : 0);

export const findAccountById = async (db: Db, id: string): Promise<Account | null> => {
  const r = await db.prepare("SELECT id, google_sub, google_email FROM accounts WHERE id = ?").bind(id).first<AccountRow>();
  return r === null ? null : toAccount(r);
};

export const findAccountByGoogleSub = async (db: Db, sub: string): Promise<Account | null> => {
  const r = await db.prepare("SELECT id, google_sub, google_email FROM accounts WHERE google_sub = ?").bind(sub).first<AccountRow>();
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
