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

function readConfig(configPath: string): Record<string, unknown> | null {
  if (!existsSync(configPath)) return null;
  const content = Deno.readTextFileSync(configPath);
  return parseJsonc(content) as Record<string, unknown>;
}

function readImportsFromConfig(configPath: string): Record<string, string> {
  const json = readConfig(configPath);
  if (!json) return {};
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
    target.startsWith("http:") || target.startsWith("https:") ||
    target.startsWith("workspace:")
  ) {
    return null;
  }
  if (isAbsolute(target)) return normalize(target);
  return normalize(join(configDir, target));
}

type WorkspaceMember = {
  dir: string;
  name: string | null;
  exports: Record<string, string> | null;
};

function readWorkspaceMembers(workspaceRoot: string): WorkspaceMember[] {
  const rootConfig = readConfig(join(workspaceRoot, "deno.json"));
  if (!rootConfig) return [];

  const workspaces = rootConfig.workspace;
  if (!Array.isArray(workspaces)) return [];

  const members: WorkspaceMember[] = [];

  for (const pattern of workspaces) {
    const dir = join(workspaceRoot, pattern.replace(/\/\*$/, ""));
    if (!existsSync(dir)) continue;

    for (const entry of Deno.readDirSync(dir)) {
      if (!entry.isDirectory) continue;
      const memberDir = join(dir, entry.name);
      for (const configFile of ["deno.json", "deno.jsonc", "package.json"]) {
        const configPath = join(memberDir, configFile);
        const json = readConfig(configPath);
        if (!json) continue;

        const name = typeof json.name === "string" ? json.name : null;
        const exports = json.exports;
        const exportsMap: Record<string, string> | null =
          exports && typeof exports === "object" && !Array.isArray(exports)
            ? exports as Record<string, string>
            : typeof exports === "string"
            ? { ".": exports }
            : null;

        members.push({
          dir: memberDir,
          name,
          exports: exportsMap,
        });
        break;
      }
    }
  }

  return members;
}

function resolveExportTarget(
  target: string,
  configDir: string,
): string | null {
  if (
    target.startsWith("jsr:") || target.startsWith("npm:") ||
    target.startsWith("http:") || target.startsWith("https:") ||
    target.startsWith("workspace:")
  ) {
    return null;
  }
  if (isAbsolute(target)) return normalize(target);
  return normalize(join(configDir, target));
}

function collectExportsFromMembers(
  members: WorkspaceMember[],
): Map<string, ImportMapEntry> {
  const entries = new Map<string, ImportMapEntry>();

  for (const member of members) {
    if (!member.name || !member.exports) continue;

    for (const [exportKey, exportTarget] of Object.entries(member.exports)) {
      const importKey = exportKey === "."
        ? member.name
        : `${member.name}${exportKey.slice(1)}`;

      const absolutePath = resolveExportTarget(exportTarget, member.dir);
      if (!entries.has(importKey)) {
        entries.set(importKey, {
          key: importKey,
          target: exportTarget,
          absolutePath,
          sourceConfig: join(member.dir, "deno.json"),
        });
      }
    }
  }

  return entries;
}

function collectImportsFromMembers(
  members: WorkspaceMember[],
): Map<string, ImportMapEntry> {
  const entries = new Map<string, ImportMapEntry>();

  for (const member of members) {
    for (const configFile of ["deno.json", "deno.jsonc", "package.json"]) {
      const configPath = join(member.dir, configFile);
      const imports = readImportsFromConfig(configPath);
      for (const [key, target] of Object.entries(imports)) {
        if (!entries.has(key)) {
          const absolutePath = resolveTarget(target, member.dir);
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

  return entries;
}

export function collectImportMap(
  memberDirs: string[],
  workspaceRoot?: string,
): ImportMap {
  const entries = new Map<string, ImportMapEntry>();

  if (workspaceRoot) {
    const members = readWorkspaceMembers(workspaceRoot);
    const exportEntries = collectExportsFromMembers(members);
    for (const [key, entry] of exportEntries) {
      if (!entries.has(key)) {
        entries.set(key, entry);
      }
    }
    const importEntries = collectImportsFromMembers(members);
    for (const [key, entry] of importEntries) {
      if (!entries.has(key)) {
        entries.set(key, entry);
      }
    }
  }

  for (const dir of memberDirs) {
    const configDir = normalize(dir);
    for (const name of ["deno.json", "deno.jsonc", "package.json"]) {
      const configPath = join(dir, name);
      if (!existsSync(configPath)) continue;

      const imports = readImportsFromConfig(configPath);

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

  if (id === entry.key) {
    if (
      existsSync(entry.absolutePath) && Deno.statSync(entry.absolutePath).isFile
    ) {
      return entry.absolutePath;
    }
    return null;
  }

  const remainder = id.slice(entry.key.length);
  const candidate = entry.absolutePath + remainder;

  if (existsSync(candidate) && Deno.statSync(candidate).isFile) {
    return candidate;
  }

  for (const ext of [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css"]) {
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

  return null;
}
