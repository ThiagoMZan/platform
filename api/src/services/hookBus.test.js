import test from "node:test";
import assert from "node:assert/strict";
import { createHookBus } from "./hookBus.js";

test("hookBus on/off/trigger preserves registration order", async () => {
  const bus = createHookBus();
  const calls = [];

  const unsubA = bus.on("sample.event", async () => {
    calls.push("a");
  });
  bus.on("sample.event", async () => {
    calls.push("b");
  });

  await bus.trigger("sample.event", {});
  assert.deepEqual(calls, ["a", "b"]);

  const removed = bus.off("sample.event", unsubA.token);
  assert.equal(removed, true);

  calls.length = 0;
  await bus.trigger("sample.event", {});
  assert.deepEqual(calls, ["b"]);
});

test("hookBus once executes only a single time", async () => {
  const bus = createHookBus();
  let count = 0;

  bus.once("sample.once", async () => {
    count += 1;
  });

  await bus.trigger("sample.once", {});
  await bus.trigger("sample.once", {});

  assert.equal(count, 1);
});

test("hookBus emit does not block caller", async () => {
  const bus = createHookBus();
  let seen = false;

  bus.on("sample.emit", async () => {
    seen = true;
  });

  bus.emit("sample.emit", {});
  assert.equal(seen, false);

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(seen, true);
});

test("hookBus offByModule removes listeners scoped to a module", async () => {
  const bus = createHookBus();
  const calls = [];

  bus.on("sample.scoped", async () => {
    calls.push("module");
  }, { moduleKey: "people-custom-acme" });
  bus.on("sample.scoped", async () => {
    calls.push("core");
  });

  const removed = bus.offByModule("people-custom-acme");
  assert.equal(removed, 1);

  await bus.trigger("sample.scoped", {});
  assert.deepEqual(calls, ["core"]);
});
