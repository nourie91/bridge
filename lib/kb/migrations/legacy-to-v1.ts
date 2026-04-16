import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CURRENT_KB_SCHEMA_VERSION } from "../schema-version.js";

interface LegacyComponents {
  components: Record<string, Array<Record<string, unknown>>>;
}

function flattenComponents(legacy: LegacyComponents): {
  version: number;
  generatedAt: string;
  components: Array<Record<string, unknown>>;
} {
  const flat: Array<Record<string, unknown>> = [];
  for (const [category, list] of Object.entries(legacy.components)) {
    for (const entry of list) {
      flat.push({ ...entry, category });
    }
  }
  return {
    version: CURRENT_KB_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    components: flat,
  };
}

function stampVersion<T extends Record<string, unknown>>(parsed: T): T & { version: number; generatedAt: string } {
  return {
    ...parsed,
    version: CURRENT_KB_SCHEMA_VERSION,
    generatedAt: (parsed.generatedAt as string | undefined) ?? new Date().toISOString(),
  };
}

export async function migrateLegacyToV1(kbPath: string): Promise<void> {
  const regDir = path.join(kbPath, "knowledge-base", "registries");
  const compFile = path.join(regDir, "components.json");
  const varsFile = path.join(regDir, "variables.json");
  const textFile = path.join(regDir, "text-styles.json");

  const compRaw = await readFile(compFile, "utf8");
  const compParsed = JSON.parse(compRaw) as LegacyComponents | { components: unknown[] };
  let compOut: unknown;
  if (Array.isArray((compParsed as { components: unknown[] }).components)) {
    compOut = stampVersion(compParsed as Record<string, unknown>);
  } else {
    compOut = flattenComponents(compParsed as LegacyComponents);
  }
  await writeFile(compFile, JSON.stringify(compOut, null, 2) + "\n", "utf8");

  const varsRaw = await readFile(varsFile, "utf8");
  const varsParsed = JSON.parse(varsRaw) as Record<string, unknown>;
  await writeFile(varsFile, JSON.stringify(stampVersion(varsParsed), null, 2) + "\n", "utf8");

  const textRaw = await readFile(textFile, "utf8");
  const textParsed = JSON.parse(textRaw) as Record<string, unknown>;
  await writeFile(textFile, JSON.stringify(stampVersion(textParsed), null, 2) + "\n", "utf8");
}
