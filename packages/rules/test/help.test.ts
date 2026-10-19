import { describe, expect, test } from "vitest";
import { advance, HELP_REDUCTION_MS, helpableJob, reduceJob, startTraining, startUpgrade, type BaseState } from "../src/index.ts";
import { base, HOUR, rich, SEC, T0 } from "./helpers.ts";

const upgrading = (): BaseState => {
  const r = startUpgrade(rich(), "farm", T0);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};

describe("reduceJob", () => {
  test("moves a running upgrade's end earlier by the amount", () => {
    const s = upgrading();
    const r = reduceJob(s, "upgrade", 10 * SEC, T0);
    expect(r.changed).toBe(true);
    expect(r.state.queue?.endsAt).toBe(s.queue!.endsAt - 10 * SEC);
    expect(advance(r.state, T0 + 20 * SEC).levels.farm).toBe(2);
    expect(advance(s, T0 + 20 * SEC).levels.farm).toBe(1);
  });

  test("works on a training batch", () => {
    const t = startTraining(rich(), "infantry", 10, T0);
    if (!t.ok) throw new Error(t.reason);
    const r = reduceJob(t.state, "training", 30 * SEC, T0);
    expect(r.state.training?.endsAt).toBe(t.state.training!.endsAt - 30 * SEC);
  });

  test("never ends before now, the job's start, or the time already settled", () => {
    const s = upgrading();
    const now = T0 + 10 * SEC;
    expect(reduceJob(s, "upgrade", HOUR, now).state.queue?.endsAt).toBe(now);
    expect(reduceJob(s, "upgrade", HOUR, T0 - HOUR).state.queue?.endsAt).toBe(s.queue!.startedAt);
    const settled = { ...s, lastUpdated: T0 + 25 * SEC };
    expect(reduceJob(settled, "upgrade", HOUR, T0).state.queue?.endsAt).toBe(T0 + 25 * SEC);
  });

  test("does nothing without a running job, for a finished job, or for a non-positive amount", () => {
    expect(reduceJob(base(), "upgrade", HELP_REDUCTION_MS, T0)).toEqual({ state: base(), changed: false });
    expect(reduceJob(base(), "training", HELP_REDUCTION_MS, T0).changed).toBe(false);
    const s = upgrading();
    expect(reduceJob(s, "upgrade", HELP_REDUCTION_MS, s.queue!.endsAt).changed).toBe(false);
    for (const ms of [0, -5, Number.NaN]) expect(reduceJob(s, "upgrade", ms, T0).changed).toBe(false);
    expect(reduceJob(s, "training", HELP_REDUCTION_MS, T0).changed).toBe(false);
  });

  test("the reduced job is still consistent: finishing exactly at the new end", () => {
    const s = upgrading();
    const r = reduceJob(s, "upgrade", 10 * SEC, T0).state;
    const end = r.queue!.endsAt;
    expect(advance(r, end - 1).queue).not.toBeNull();
    expect(advance(r, end).queue).toBeNull();
  });
});

describe("helpableJob", () => {
  test("describes only a job still running at now", () => {
    const s = upgrading();
    expect(helpableJob(s, "upgrade", T0)).toEqual({ startedAt: T0, endsAt: s.queue!.endsAt });
    expect(helpableJob(s, "upgrade", s.queue!.endsAt)).toBeNull();
    expect(helpableJob(s, "training", T0)).toBeNull();
  });
});
