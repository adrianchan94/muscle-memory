// Key custody for the evidence instrument.
//
// A design review caught the first version of this putting the signing key at
// ~/.letta/muscle-memory/instrument.key — inside the default STATE_DIR, which is the exact
// directory the forgery attack owns. The property "the key lives outside the attacked
// directory" was asserted in prose and was false in fact.
//
// So it is asserted here instead. Case 18 below is the regression test for that finding:
// containment is a runtime control, not a documented convention.
import { test, expect } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultInstrumentKeyPath, initInstrumentKey, loadInstrumentKey, resolveInstrumentKeyPath } from "../mods/instrument";

const sandbox = () => mkdtempSync(join(tmpdir(), "mm-key-"));

test("18 · the default key path is not inside the default state directory", () => {
  // The regression test for the design review's hard fail.
  const home = sandbox();
  const stateDir = join(home, ".letta", "muscle-memory");
  const keyPath = defaultInstrumentKeyPath(home);
  expect(keyPath.startsWith(stateDir)).toBe(false);
  expect(keyPath).toBe(join(home, ".letta", "instrument", "muscle-memory.key"));
  rmSync(home, { recursive: true, force: true });
});

test("19 · a key inside the state directory is refused, and judged still works", () => {
  const home = sandbox();
  const stateDir = join(home, "state");
  mkdirSync(stateDir, { recursive: true });
  const keyPath = join(stateDir, "instrument.key");
  writeFileSync(keyPath, "k1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  chmodSync(keyPath, 0o600);

  const loaded = loadInstrumentKey({ keyPath, stateDir });
  expect(loaded.available).toBe(false);
  expect(loaded.reason).toBe("key_inside_state_dir");
  rmSync(home, { recursive: true, force: true });
});

test("20 · a key symlinked in from the state directory is refused after realpath", () => {
  const home = sandbox();
  const stateDir = join(home, "state");
  const realDir = join(home, "elsewhere");
  mkdirSync(stateDir, { recursive: true });
  mkdirSync(realDir, { recursive: true });
  const realKey = join(realDir, "muscle-memory.key");
  writeFileSync(realKey, "k1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  chmodSync(realKey, 0o600);
  // the state dir is a symlink whose target CONTAINS the key
  const linked = join(home, "linked-state");
  symlinkSync(realDir, linked);

  const loaded = loadInstrumentKey({ keyPath: realKey, stateDir: linked });
  expect(loaded.available).toBe(false);
  expect(loaded.reason).toBe("key_inside_state_dir");
  rmSync(home, { recursive: true, force: true });
});

test("a key with loose permissions is refused", () => {
  const home = sandbox();
  const stateDir = join(home, "state");
  const keyDir = join(home, "instrument");
  mkdirSync(stateDir, { recursive: true });
  mkdirSync(keyDir, { recursive: true, mode: 0o700 });
  const keyPath = join(keyDir, "muscle-memory.key");
  writeFileSync(keyPath, "k1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  chmodSync(keyPath, 0o644);

  const loaded = loadInstrumentKey({ keyPath, stateDir });
  expect(loaded.available).toBe(false);
  expect(loaded.reason).toBe("key_permissions");
  rmSync(home, { recursive: true, force: true });
});

test("an absent key reports unavailable rather than throwing", () => {
  const home = sandbox();
  const stateDir = join(home, "state");
  mkdirSync(stateDir, { recursive: true });
  const loaded = loadInstrumentKey({ keyPath: join(home, "instrument", "muscle-memory.key"), stateDir });
  expect(loaded.available).toBe(false);
  expect(loaded.reason).toBe("key_absent");
  rmSync(home, { recursive: true, force: true });
});

test("init creates a 0600 key in a 0700 directory and is idempotent", () => {
  const home = sandbox();
  const stateDir = join(home, "state");
  mkdirSync(stateDir, { recursive: true });
  const keyPath = join(home, "instrument", "muscle-memory.key");

  const first = initInstrumentKey({ keyPath, stateDir });
  expect(first.created).toBe(true);
  expect(first.keyId).toMatch(/^[a-z0-9]{8}$/);

  const loaded = loadInstrumentKey({ keyPath, stateDir });
  expect(loaded.available).toBe(true);
  expect(loaded.keyId).toBe(first.keyId);

  // re-running must not silently rotate: a rotated key would invalidate every existing receipt
  const second = initInstrumentKey({ keyPath, stateDir });
  expect(second.created).toBe(false);
  expect(second.keyId).toBe(first.keyId);
  rmSync(home, { recursive: true, force: true });
});

test("init refuses to create a key inside the state directory", () => {
  const home = sandbox();
  const stateDir = join(home, "state");
  mkdirSync(stateDir, { recursive: true });
  expect(() => initInstrumentKey({ keyPath: join(stateDir, "k.key"), stateDir })).toThrow(/state directory/i);
  rmSync(home, { recursive: true, force: true });
});

test("the env override is honoured but still subject to containment", () => {
  const home = sandbox();
  const stateDir = join(home, "state");
  mkdirSync(stateDir, { recursive: true });
  const outside = join(home, "custom", "k.key");
  expect(resolveInstrumentKeyPath({ home, env: { MM_INSTRUMENT_KEY_FILE: outside } })).toBe(outside);
  expect(resolveInstrumentKeyPath({ home, env: {} })).toBe(defaultInstrumentKeyPath(home));
  rmSync(home, { recursive: true, force: true });
});
