import { parse as parseJsonc } from "@std/jsonc";
import { existsSync, expandGlob } from "@std/fs";
import { dirname, join, normalize } from "@std/path";

export type WorkspaceConfig = {
  rootDir: string;
  members: string[];
};

function readJsonc(path: string): Record<string, unknown> {
  const content = Deno.readTextFileSync(path);
  return parseJsonc(content) as Record<string, unknown>;
}

export function findWorkspaceRoot(startDir: string): WorkspaceConfig | null {
  let dir = normalize(startDir);
  const root = dir[0] === "/" ? "/" : undefined;
  let firstConfigDir: string | null = null;

  while (true) {
    for (const name of ["deno.json", "deno.jsonc"]) {
      const candidate = join(dir, name);
      if (!existsSync(candidate)) continue;

      if (firstConfigDir === null) firstConfigDir = dir;

      const json = readJsonc(candidate);
      if (json.workspace && Array.isArray(json.workspace)) {
        return {
          rootDir: dir,
          members: json.workspace.filter((m): m is string =>
            typeof m === "string"
          ),
        };
      }
    }
    const parent = dirname(dir);
    if (parent === dir || (root !== undefined && dir === root)) break;
    dir = parent;
  }

  if (!firstConfigDir) return null;
  return { rootDir: firstConfigDir, members: [] };
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
