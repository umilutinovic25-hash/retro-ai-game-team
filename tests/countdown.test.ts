import test from "node:test";
import assert from "node:assert/strict";
import { createCountdown, type CountdownLabel } from "../src/ui/countdown.ts";

function fakeScheduler() {
  let now = 0;
  let nextId = 1;
  const tasks = new Map<number, { at: number; fn: () => void }>();
  return {
    schedule: (fn: () => void, ms: number) => { const id = nextId++; tasks.set(id, { at: now + ms, fn }); return id; },
    cancelScheduled: (id: unknown) => { tasks.delete(id as number); },
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = [...tasks.entries()].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at;
        tasks.delete(due[0]);
        due[1].fn();
      }
      now = end;
    },
  };
}

function fixture() {
  const clock = fakeScheduler();
  const log: string[] = [];
  const countdown = createCountdown({
    stepMs: 550,
    onLabel: (label: CountdownLabel) => { log.push(label); },
    onHide: () => { log.push("hide"); },
    schedule: clock.schedule,
    cancelScheduled: clock.cancelScheduled,
  });
  return { clock, log, countdown };
}

test("counts 3, 2, 1, then GO and calls onDone exactly once", () => {
  const { clock, log, countdown } = fixture();
  let done = 0;
  countdown.start(() => { done += 1; });
  assert.equal(countdown.isRunning(), true);
  clock.advance(0);
  assert.deepEqual(log, ["3"]);
  clock.advance(550);
  clock.advance(550);
  assert.deepEqual(log, ["3", "2", "1"]);
  assert.equal(done, 0);
  assert.equal(countdown.isRunning(), true);
  clock.advance(550);
  assert.deepEqual(log, ["3", "2", "1", "GO!"]);
  assert.equal(done, 1);
  assert.equal(countdown.isRunning(), false);
  clock.advance(520);
  assert.deepEqual(log, ["3", "2", "1", "GO!", "hide"]);
  clock.advance(5000);
  assert.equal(done, 1);
});

test("cancelling stops the countdown, never calls onDone and hides once", () => {
  const { clock, log, countdown } = fixture();
  let done = 0;
  countdown.start(() => { done += 1; });
  clock.advance(600);
  countdown.cancel();
  assert.equal(countdown.isRunning(), false);
  clock.advance(5000);
  assert.equal(done, 0);
  assert.deepEqual(log, ["3", "2", "hide"]);
});

test("starting again replaces the running countdown", () => {
  const { clock, log, countdown } = fixture();
  const calls: string[] = [];
  countdown.start(() => { calls.push("first"); });
  clock.advance(600);
  countdown.start(() => { calls.push("second"); });
  clock.advance(5000);
  assert.deepEqual(calls, ["second"]);
  assert.equal(log.filter((entry) => entry === "GO!").length, 1);
});

test("cancelling when idle is harmless", () => {
  const { countdown, log } = fixture();
  assert.doesNotThrow(() => countdown.cancel());
  assert.equal(countdown.isRunning(), false);
  assert.deepEqual(log, ["hide"]);
});
