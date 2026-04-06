import { parse as parseJsonc } from "@std/jsonc";
import { existsSync, expandGlob } from "@std/fs";
import { dirname, join, normalize } from "@std/path";

export type WorkspaceConfig = {
  rootDir: string;
  members: string[];
};

function findDenoJson(startDir: string): string | null {
  let dir = normalize(startDir);
  const root = dir[0] === "/" ? "/" : undefined;
  while (true) {
    for (const name of ["deno.json", "deno.jsonc"]) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir || (root !== undefined && dir === root)) break;
    dir = parent;
  }
  return null;
}

function readJsonc(path: string): Record<string, unknown> {
  const content = Deno.readTextFileSync(path);
  return parseJsonc(content) as Record<string, unknown>;
}

export function findWorkspaceRoot(startDir: string): WorkspaceConfig | null {
  const configPath = findDenoJson(startDir);
  if (!configPath) return null;

  const json = readJsonc(configPath);
  const rootDir = dirname(configPath);

  if (json.workspace) {
    const raw = json.workspace;
    if (Array.isArray(raw)) {
      return {
        rootDir,
        members: raw.filter((m): m is string => typeof m === "string"),
      };
    }
  }

  return { rootDir, members: [] };
}

export async function expandMembers(
  workspace: WorkspaceConfig,
): Promise<string[]> {
  const dirs: string[] = [];
  for (const pattern of workspace.members) {
    const glob = join(workspace.rootDir, pattern);
    for await (const entry of expandGlob(glob, { includeDirs: true })) {
      if (entry.isDirectory) {
        dirs.push(entry.path);
      }
    }
  }
  return dirs;
}
