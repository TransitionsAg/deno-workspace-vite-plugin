import { parse as parseJsonc } from "@std/jsonc";
import { existsSync } from "@std/fs/exists";
import { isAbsolute, join, normalize } from "@std/path";

export type ImportMapEntry = {
  key: string;
  target: string;
  absolutePath: string | null;
  sourceConfig: string;
};

export type ImportMap = {
  entries: Map<string, ImportMapEntry>;
};

function readImportsFromConfig(configPath: string): Record<string, string> {
  if (!existsSync(configPath)) return {};
  const content = Deno.readTextFileSync(configPath);
  const json = parseJsonc(content) as Record<string, unknown>;
  const imports = json.imports;
  if (!imports || typeof imports !== "object") return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(imports)) {
    if (typeof value === "string") {
      result[key] = value;
    }
  }
  return result;
}

function resolveTarget(target: string, configDir: string): string | null {
  if (
    target.startsWith("jsr:") || target.startsWith("npm:") ||
    target.startsWith("http:") || target.startsWith("https:")
  ) {
    return null;
  }
  if (isAbsolute(target)) return normalize(target);
  return normalize(join(configDir, target));
}

export function collectImportMap(
  memberDirs: string[],
): ImportMap {
  const entries = new Map<string, ImportMapEntry>();

  for (const dir of memberDirs) {
    for (const name of ["deno.json", "deno.jsonc"]) {
      const configPath = join(dir, name);
      if (!existsSync(configPath)) continue;

      const imports = readImportsFromConfig(configPath);
      const configDir = normalize(dir);

      for (const [key, target] of Object.entries(imports)) {
        if (!entries.has(key)) {
          const absolutePath = resolveTarget(target, configDir);
          entries.set(key, {
            key,
            target,
            absolutePath,
            sourceConfig: configPath,
          });
        }
      }
      break;
    }
  }

  return { entries };
}

export function matchImportMap(
  id: string,
  importMap: ImportMap,
): ImportMapEntry | null {
  let best: ImportMapEntry | null = null;
  let bestLen = 0;

  for (const entry of importMap.entries.values()) {
    if (id === entry.key) {
      return entry;
    }
    if (id.startsWith(entry.key) && entry.key.length > bestLen) {
      best = entry;
      bestLen = entry.key.length;
    }
  }

  return best;
}

export function resolveEntry(entry: ImportMapEntry, id: string): string | null {
  if (!entry.absolutePath) return null;

  if (id === entry.key) return entry.absolutePath;

  const remainder = id.slice(entry.key.length);
  const candidate = entry.absolutePath + remainder;

  if (existsSync(candidate) && Deno.statSync(candidate).isFile) {
    return candidate;
  }

  for (const ext of [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]) {
    const withExt = candidate + ext;
    if (existsSync(withExt)) return withExt;
  }

  const indexCandidates = [
    join(candidate, "mod.ts"),
    join(candidate, "mod.tsx"),
    join(candidate, "index.ts"),
    join(candidate, "index.tsx"),
  ];
  for (const c of indexCandidates) {
    if (existsSync(c)) return c;
  }

  return candidate;
}
