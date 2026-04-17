import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseKBConfig } from "./kb-config.js";

test("parseKBConfig accepts minimal config with defaults", async () => {
  const raw = await readFile(path.resolve("test/fixtures/kb-config/minimal.yaml"), "utf8");
  const cfg = parseKBConfig(raw);
  assert.equal(cfg.dsName, "Spectra");
  assert.equal(cfg.kbPath, "bridge-ds");
  assert.equal(cfg.cron.cadence, "daily");
  assert.equal(cfg.cron.time, "06:00");
});

test("parseKBConfig accepts full config", async () => {
  const raw = await readFile(path.resolve("test/fixtures/kb-config/full.yaml"), "utf8");
  const cfg = parseKBConfig(raw);
  assert.equal(cfg.tagline, "Finary's design system.");
  assert.equal(cfg.kbPath, "bridge-ds");
});

test("parseKBConfig throws on missing required field", () => {
  assert.throws(() => parseKBConfig("dsName: Spectra\n"));
});

test("parseKBConfig throws on empty dsName", () => {
  assert.throws(() => parseKBConfig('dsName: ""\nfigmaFileKey: abc\n'));
});

test("parseKBConfig rejects custom YAML tags (defense-in-depth)", () => {
  assert.throws(() =>
    parseKBConfig('dsName: x\nfigmaFileKey: y\nkbPath: !!js/function "() => 1"\n')
  );
});
