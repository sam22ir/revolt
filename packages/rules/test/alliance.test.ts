import { test } from "vitest";
import {
  ALLIANCE_ACTIONS,
  ALLIANCE_RANKS,
  canKick,
  canPerform,
  CHAT_MAX_LENGTH,
  demotedRank,
  nameKey,
  promotedRank,
  validateAllianceName,
  validateAllianceTag,
  validateChatText,
} from "../src/index.ts";
import { ex } from "./helpers.ts";

const AR = "الحرية";

test("alliance permissions: action matrix, kick rank, promotion and demotion", () => {
  {
    const e = ex("the matrix");
    const allowed = (a: (typeof ALLIANCE_ACTIONS)[number]) => ALLIANCE_RANKS.filter((r) => canPerform(r, a));
    e(allowed("kick"), "kick").toEqual(["leader", "officer"]);
    e(allowed("start_rally"), "start_rally").toEqual(["leader", "officer"]);
    for (const a of ["promote", "demote", "transfer", "set_hq", "disband"] as const) e(allowed(a), a).toEqual(["leader"]);
  }

  {
    const e = ex("kicking needs a strictly lower rank");
    e(canKick("leader", "officer"), "leader>officer").toBe(true);
    e(canKick("leader", "member"), "leader>member").toBe(true);
    e(canKick("officer", "member"), "officer>member").toBe(true);
    e(canKick("officer", "officer"), "officer=officer").toBe(false);
    e(canKick("officer", "leader"), "officer<leader").toBe(false);
    e(canKick("member", "member"), "member=member").toBe(false);
    e(canKick("leader", "leader"), "leader=leader").toBe(false);
  }

  {
    const e = ex("promotion and demotion move one step; a leader changes only by transfer");
    e(promotedRank("member"), "promote member").toBe("officer");
    e(promotedRank("officer"), "promote officer").toBeNull();
    e(promotedRank("leader"), "promote leader").toBeNull();
    e(demotedRank("officer"), "demote officer").toBe("member");
    e(demotedRank("member"), "demote member").toBeNull();
    e(demotedRank("leader"), "demote leader").toBeNull();
  }
});

test("validateAllianceName: normalising, unicode, rejects, forbidden characters, nameKey", () => {
  {
    const e = ex("accepts 3–24 characters, trimmed, single spaces, NFC");
    e(validateAllianceName("  Free   Lands "), "spaces").toBe("Free Lands");
    e(validateAllianceName("abc"), "min length").toBe("abc");
    e(validateAllianceName("x".repeat(24)), "max length").toBe("x".repeat(24));
    e(validateAllianceName("équipe"), "NFC").toBe("\xe9quipe");
  }

  {
    const e = ex("counts characters, not UTF-16 units, and accepts Arabic and French");
    e(validateAllianceName(AR), "arabic").toBe(AR);
    e(validateAllianceName("Les Aur\xe8s"), "french").toBe("Les Aur\xe8s");
    e(validateAllianceName("\u{1f600}".repeat(24)), "24 emoji").not.toBeNull();
    e(validateAllianceName("\u{1f600}".repeat(25)), "25 emoji").toBeNull();
  }

  {
    const e = ex("rejects too short, too long, empty and non-strings");
    for (const v of ["", "  ", "ab", "x".repeat(25), null, 5, undefined, {}]) e(validateAllianceName(v), String(v)).toBeNull();
  }

  {
    const e = ex("rejects control, format and separator characters (bidi overrides, zero-width, newlines)");
    for (const bad of ["ab‮cd", "ab⁦cd", "ab​cd", "ab‏cd", "ab\ncd", "ab\tcd", "ab cd", "ab\u0000cd", "ab﻿cd", "abcd"]) {
      e(validateAllianceName(bad), JSON.stringify(bad)).toBeNull();
    }
  }

  {
    const e = ex("nameKey folds ASCII case and normalises, so duplicates are caught");
    e(nameKey("Free Lands"), "case").toBe(nameKey("free lands"));
    e(nameKey("é"), "normalisation").toBe(nameKey("\xe9"));
    e(nameKey(AR), "arabic").toBe(AR);
  }
});

test("validateAllianceTag and validateChatText", () => {
  {
    const e = ex("2–4 ASCII letters and digits, upper-cased");
    e(validateAllianceTag("ab"), "ab").toBe("AB");
    e(validateAllianceTag(" z9x1 "), "z9x1").toBe("Z9X1");
    for (const bad of ["a", "abcde", "a b", "\xe9", "ا", "a-b", "", null, 3]) e(validateAllianceTag(bad), String(bad)).toBeNull();
  }

  {
    const e = ex("accepts plain text up to the limit and trims");
    e(validateChatText("  salut  "), "trim").toBe("salut");
    const ar = "مرحبا بالجميع";
    e(validateChatText(ar), "arabic").toBe(ar);
    e(validateChatText("x".repeat(CHAT_MAX_LENGTH)), "limit").not.toBeNull();
  }

  {
    const e = ex("rejects empty, too long, newlines, bidi overrides and non-strings");
    for (const bad of ["", "   ", "x".repeat(CHAT_MAX_LENGTH + 1), "a\nb", "a‮b", "a​b", null, 4, {}]) {
      e(validateChatText(bad), JSON.stringify(bad)).toBeNull();
    }
  }

  ex("markup is not special: it is just text for the client to show as text")(validateChatText("<img src=x onerror=alert(1)>")).toBe(
    "<img src=x onerror=alert(1)>",
  );
});
