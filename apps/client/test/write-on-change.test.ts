import { expect, test } from "vitest";
import { writeOnChange } from "../src/ui/write-on-change.ts";
import { rows, type Row } from "./rows.ts";

const RA: Row[] = [];

RA.push(["the first value is always written, even when it is false or empty", () => {
  const seen: unknown[] = [];
  const set = writeOnChange((v: unknown) => seen.push(v));
  set(false);
  set("");
  expect(seen).toEqual([false, ""]);
}]);

RA.push(["a repeated value is not written again", () => {
  const seen: string[] = [];
  const set = writeOnChange((v: string) => seen.push(v));
  set("rel-own");
  set("rel-own");
  set("rel-own");
  expect(seen).toEqual(["rel-own"]);
}]);

RA.push(["a change is written, and a return to an earlier value is written too", () => {
  const seen: boolean[] = [];
  const set = writeOnChange((v: boolean) => seen.push(v));
  set(true);
  set(true);
  set(false);
  set(true);
  expect(seen).toEqual([true, false, true]);
}]);

RA.push(["slots are independent of each other", () => {
  const a: string[] = [];
  const b: string[] = [];
  const setA = writeOnChange((v: string) => a.push(v));
  const setB = writeOnChange((v: string) => b.push(v));
  setA("x");
  setB("x");
  setA("x");
  expect(a).toEqual(["x"]);
  expect(b).toEqual(["x"]);
}]);

test("write on change: DOM writes run only when the value moves", () => rows(RA));
