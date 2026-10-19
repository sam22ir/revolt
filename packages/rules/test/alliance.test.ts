import { describe, expect, test } from "vitest";
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

describe("permissions", () => {
  test("the matrix", () => {
    const allowed = (a: (typeof ALLIANCE_ACTIONS)[number]) => ALLIANCE_RANKS.filter((r) => canPerform(r, a));
    expect(allowed("kick")).toEqual(["leader", "officer"]);
    expect(allowed("start_rally")).toEqual(["leader", "officer"]);
    for (const a of ["promote", "demote", "transfer", "set_hq", "disband"] as const) expect(allowed(a), a).toEqual(["leader"]);
  });

  test("kicking needs a strictly lower rank", () => {
    expect(canKick("leader", "officer")).toBe(true);
    expect(canKick("leader", "member")).toBe(true);
    expect(canKick("officer", "member")).toBe(true);
    expect(canKick("officer", "officer")).toBe(false);
    expect(canKick("officer", "leader")).toBe(false);
    expect(canKick("member", "member")).toBe(false);
    expect(canKick("leader", "leader")).toBe(false);
  });

  test("promotion and demotion move one step; a leader changes only by transfer", () => {
    expect(promotedRank("member")).toBe("officer");
    expect(promotedRank("officer")).toBeNull();
    expect(promotedRank("leader")).toBeNull();
    expect(demotedRank("officer")).toBe("member");
    expect(demotedRank("member")).toBeNull();
    expect(demotedRank("leader")).toBeNull();
  });
});

describe("validateAllianceName", () => {
  test("accepts 3–24 characters, trimmed, single spaces, NFC", () => {
    expect(validateAllianceName("  Free   Lands ")).toBe("Free Lands");
    expect(validateAllianceName("abc")).toBe("abc");
    expect(validateAllianceName("x".repeat(24))).toBe("x".repeat(24));
    expect(validateAllianceName("équipe")).toBe("équipe");
  });

  test("counts characters, not UTF-16 units, and accepts Arabic and French", () => {
    expect(validateAllianceName("الحرية")).toBe("الحرية");
    expect(validateAllianceName("Les Aurès")).toBe("Les Aurès");
    expect(validateAllianceName("😀".repeat(24))).not.toBeNull();
    expect(validateAllianceName("😀".repeat(25))).toBeNull();
  });

  test("rejects too short, too long, empty and non-strings", () => {
    for (const v of ["", "  ", "ab", "x".repeat(25), null, 5, undefined, {}]) expect(validateAllianceName(v), String(v)).toBeNull();
  });

  test("rejects control, format and separator characters (bidi overrides, zero-width, newlines)", () => {
    for (const bad of ["ab‮cd", "ab⁦cd", "ab​cd", "ab‏cd", "ab\ncd", "ab\tcd", "ab cd", "ab\u0000cd", "ab﻿cd", "abcd"]) {
      expect(validateAllianceName(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  test("nameKey folds ASCII case and normalises, so duplicates are caught", () => {
    expect(nameKey("Free Lands")).toBe(nameKey("free lands"));
    expect(nameKey("é")).toBe(nameKey("é"));
    expect(nameKey("الحرية")).toBe("الحرية");
  });
});

describe("validateAllianceTag", () => {
  test("2–4 ASCII letters and digits, upper-cased", () => {
    expect(validateAllianceTag("ab")).toBe("AB");
    expect(validateAllianceTag(" z9x1 ")).toBe("Z9X1");
    for (const bad of ["a", "abcde", "a b", "é", "ا", "a-b", "", null, 3]) expect(validateAllianceTag(bad), String(bad)).toBeNull();
  });
});

describe("validateChatText", () => {
  test("accepts plain text up to the limit and trims", () => {
    expect(validateChatText("  salut  ")).toBe("salut");
    expect(validateChatText("مرحبا بالجميع")).toBe("مرحبا بالجميع");
    expect(validateChatText("x".repeat(CHAT_MAX_LENGTH))).not.toBeNull();
  });

  test("rejects empty, too long, newlines, bidi overrides and non-strings", () => {
    for (const bad of ["", "   ", "x".repeat(CHAT_MAX_LENGTH + 1), "a\nb", "a‮b", "a​b", null, 4, {}]) {
      expect(validateChatText(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  test("markup is not special: it is just text for the client to show as text", () => {
    expect(validateChatText("<img src=x onerror=alert(1)>")).toBe("<img src=x onerror=alert(1)>");
  });
});
