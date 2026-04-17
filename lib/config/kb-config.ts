import { load as yamlLoad, JSON_SCHEMA } from "js-yaml";
import { z } from "zod";

const CronCfg = z.object({
  cadence: z.string().default("daily"),
  time: z.string().default("06:00"),
  maxPRsPerWeek: z.number().int().positive().default(7),
  autoMergeIfTrivial: z.boolean().default(false),
});

export const KBConfigSchema = z.object({
  dsName: z.string().min(1),
  tagline: z.string().optional(),
  figmaFileKey: z.string().min(1),
  kbPath: z.string().default("bridge-ds"),
  cron: CronCfg.default({}),
});

export type KBConfig = z.infer<typeof KBConfigSchema>;

export function parseKBConfig(raw: string): KBConfig {
  // JSON_SCHEMA rejects custom YAML tags (e.g. `!!js/function`) that could
  // execute code at parse time. The config is plain data, so this is safe
  // and strictly tighter than the library default.
  const parsed = yamlLoad(raw, { schema: JSON_SCHEMA });
  return KBConfigSchema.parse(parsed);
}
