import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, cpSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { migrateLegacyToV1 } from "./legacy-to-v1.js";
import { assertKBCompatible, CURRENT_KB_SCHEMA_VERSION } from "../schema-version.js";

// Fixture path resolves from CWD (repo root) — matches existing test convention.
const FIXTURE = path.resolve("test/fixtures/kb/legacy-grouped");

function cloneFixture(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "bridge-migrate-"));
  cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

test("migrateLegacyToV1 flattens grouped components into a flat array", async () => {
  const dir = cloneFixture();
  try {
    await migrateLegacyToV1(dir);
    const raw = readFileSync(
      path.join(dir, "knowledge-base", "registries", "components.json"),
      "utf8"
    );
    const parsed = JSON.parse(raw);
    assert.ok(Array.isArray(parsed.components));
    assert.equal(parsed.components.length, 2);
    assert.equal(parsed.version, CURRENT_KB_SCHEMA_VERSION);
    const names = parsed.components.map((c: { name: string }) => c.name).sort();
    assert.deepEqual(names, ["Button", "Input"]);
    const inputEntry = parsed.components.find((c: { name: string }) => c.name === "Input");
    assert.equal(inputEntry.category, "forms");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("migrateLegacyToV1 adds version and generatedAt to variables.json if absent", async () => {
  const dir = cloneFixture();
  try {
    await migrateLegacyToV1(dir);
    const raw = readFileSync(
      path.join(dir, "knowledge-base", "registries", "variables.json"),
      "utf8"
    );
    const parsed = JSON.parse(raw);
    assert.equal(parsed.version, CURRENT_KB_SCHEMA_VERSION);
    assert.ok(typeof parsed.generatedAt === "string");
    assert.equal(parsed.variables.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("migrateLegacyToV1 adds version to text-styles.json", async () => {
  const dir = cloneFixture();
  try {
    await migrateLegacyToV1(dir);
    const raw = readFileSync(
      path.join(dir, "knowledge-base", "registries", "text-styles.json"),
      "utf8"
    );
    const parsed = JSON.parse(raw);
    assert.equal(parsed.version, CURRENT_KB_SCHEMA_VERSION);
    assert.equal(parsed.styles.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("migrateLegacyToV1 stamps version on icons.json when present, skips when absent", async () => {
  const dir = cloneFixture();
  const iconsFile = path.join(dir, "knowledge-base", "registries", "icons.json");
  const fs = await import("node:fs");
  fs.writeFileSync(iconsFile, JSON.stringify({ items: [{ name: "check" }] }));
  try {
    await migrateLegacyToV1(dir);
    const parsed = JSON.parse(fs.readFileSync(iconsFile, "utf8"));
    assert.equal(parsed.version, CURRENT_KB_SCHEMA_VERSION);
    assert.ok(typeof parsed.generatedAt === "string");
    assert.equal(parsed.items.length, 1);
    // logos.json absent → migration does not create it
    const logosFile = path.join(dir, "knowledge-base", "registries", "logos.json");
    assert.equal(fs.existsSync(logosFile), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("after migration, assertKBCompatible passes", async () => {
  const dir = cloneFixture();
  try {
    await migrateLegacyToV1(dir);
    assertKBCompatible(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
