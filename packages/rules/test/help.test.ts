import { test } from "vitest";
import { advance, HELP_REDUCTION_MS, helpableJob, reduceJob, startTraining, startUpgrade, type BaseState, NO_WORLD } from "../src/index.ts";
import { base, ex, HOUR, rich, SEC, T0 } from "./helpers.ts";

const upgrading = (): BaseState => {
  const r = startUpgrade(rich(), "farm", T0, NO_WORLD);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};

test("help: reduceJob on upgrades and training, floors, no-ops, consistency; helpableJob", () => {
  {
    const e = ex("moves a running upgrade's end earlier by the amount");
    const s = upgrading();
    const r = reduceJob(s, "upgrade", 10 * SEC, T0);
    e(r.changed, "changed").toBe(true);
    e(r.state.queue?.endsAt, "endsAt").toBe(s.queue!.endsAt - 10 * SEC);
    e(advance(r.state, T0 + 20 * SEC, NO_WORLD).levels.farm, "done at 20s").toBe(2);
    e(advance(s, T0 + 20 * SEC, NO_WORLD).levels.farm, "original not done at 20s").toBe(1);
  }

  {
    const t = startTraining(rich(), "infantry", 10, T0, NO_WORLD);
    if (!t.ok) throw new Error(t.reason);
    const r = reduceJob(t.state, "training", 30 * SEC, T0);
    ex("works on a training batch")(r.state.training?.endsAt).toBe(t.state.training!.endsAt - 30 * SEC);
  }

  {
    const e = ex("never ends before now, the job's start, or the time already settled");
    const s = upgrading();
    const now = T0 + 10 * SEC;
    e(reduceJob(s, "upgrade", HOUR, now).state.queue?.endsAt, "floor: now").toBe(now);
    e(reduceJob(s, "upgrade", HOUR, T0 - HOUR).state.queue?.endsAt, "floor: job start").toBe(s.queue!.startedAt);
    const settled = { ...s, lastUpdated: T0 + 25 * SEC };
    e(reduceJob(settled, "upgrade", HOUR, T0).state.queue?.endsAt, "floor: lastUpdated").toBe(T0 + 25 * SEC);
  }

  {
    const e = ex("does nothing without a running job, for a finished job, or for a non-positive amount");
    e(reduceJob(base(), "upgrade", HELP_REDUCTION_MS, T0), "no upgrade").toEqual({ state: base(), changed: false });
    e(reduceJob(base(), "training", HELP_REDUCTION_MS, T0).changed, "no training").toBe(false);
    const s = upgrading();
    e(reduceJob(s, "upgrade", HELP_REDUCTION_MS, s.queue!.endsAt).changed, "finished job").toBe(false);
    for (const ms of [0, -5, Number.NaN]) e(reduceJob(s, "upgrade", ms, T0).changed, `amount ${ms}`).toBe(false);
    e(reduceJob(s, "training", HELP_REDUCTION_MS, T0).changed, "wrong queue kind").toBe(false);
  }

  {
    const e = ex("the reduced job is still consistent: finishing exactly at the new end");
    const r = reduceJob(upgrading(), "upgrade", 10 * SEC, T0).state;
    const end = r.queue!.endsAt;
    e(advance(r, end - 1, NO_WORLD).queue, "1ms before end").not.toBeNull();
    e(advance(r, end, NO_WORLD).queue, "at end").toBeNull();
  }

  {
    const e = ex("describes only a job still running at now");
    const s = upgrading();
    e(helpableJob(s, "upgrade", T0), "running").toEqual({ startedAt: T0, endsAt: s.queue!.endsAt });
    e(helpableJob(s, "upgrade", s.queue!.endsAt), "finished").toBeNull();
    e(helpableJob(s, "training", T0), "other queue").toBeNull();
  }
});
