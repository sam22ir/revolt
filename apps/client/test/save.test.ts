import { createBaseState, NO_WORLD, startUpgrade } from "@revolt/rules";
import { expect } from "vitest";
import { parseSave, serializeSave } from "../src/state/save.ts";
import { test } from "vitest";
import { rows, type Row } from "./rows.ts";
const RA: Row[] = [];

const T0 = Date.UTC(2026, 0, 1);

RA.push(["round-trips a state with a queued upgrade", () => {
  const r = startUpgrade(createBaseState(T0), "hq", T0, NO_WORLD);
  expect(r.ok).toBe(true);
  expect(parseSave(serializeSave(r.state))).toEqual(r.state);
}]);

RA.push(["rejects missing, corrupt, wrong-version and malformed saves", () => {
  expect(parseSave(null)).toBeNull();
  expect(parseSave("{not json")).toBeNull();
  expect(parseSave(JSON.stringify({ version: 99, state: createBaseState(T0) }))).toBeNull();
  const bad = { ...createBaseState(T0), resources: { food: "lots", materiel: 0, funds: 0, support: 0 } };
  expect(parseSave(JSON.stringify({ version: 1, state: bad }))).toBeNull();
  const badLevel = { ...createBaseState(T0), levels: { hq: 0, farm: 1, armory: 1, treasury: 1 } };
  expect(parseSave(JSON.stringify({ version: 1, state: badLevel }))).toBeNull();
  const badQueue = { ...createBaseState(T0), queue: { building: "castle", toLevel: 2, startedAt: 0, endsAt: 1 } };
  expect(parseSave(JSON.stringify({ version: 1, state: badQueue }))).toBeNull();
}]);


test("save and load: round trip and rejected saves", () => rows(RA));
