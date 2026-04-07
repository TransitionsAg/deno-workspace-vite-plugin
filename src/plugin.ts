import type { Plugin } from "vite";
import { expandMembers, findWorkspaceRoot } from "./workspace.ts";
import {
  collectImportMap,
  matchImportMap,
  resolveEntry,
} from "./import-map.ts";

export type DenoWorkspaceVitePluginOptions = {
  root?: string;
};

export function denoWorkspaceVitePlugin(
  options: DenoWorkspaceVitePluginOptions = {},
): Plugin {
  let importMap: Awaited<ReturnType<typeof collectImportMap>> | null = null;
  let initialized = false;

  return {
    name: "deno-workspace-resolver",
    enforce: "pre",

    async config(config) {
      const root = options.root ?? config.root ?? Deno.cwd();
      const workspace = findWorkspaceRoot(root);
      if (!workspace) return;

      const memberDirs = await expandMembers(workspace);
      importMap = await collectImportMap(memberDirs, workspace.rootDir);
      if (!importMap) return;

      const alias: Record<string, string> = {};
      for (const entry of importMap.entries.values()) {
        if (!entry.absolutePath) continue;
        const resolved = resolveEntry(entry, entry.key);
        if (resolved) {
          alias[entry.key] = resolved;
        }
      }

      if (Object.keys(alias).length > 0) {
        return {
          resolve: { alias },
        };
      }
    },

    async configResolved(config) {
      if (initialized) return;
      if (!importMap) {
        const root = options.root ?? config.root;
        const workspace = findWorkspaceRoot(root);
        if (!workspace) {
          initialized = true;
          return;
        }

        const memberDirs = await expandMembers(workspace);
        importMap = await collectImportMap(memberDirs, workspace.rootDir);
      }
      initialized = true;
    },

    resolveId(id) {
      if (!importMap) return null;
      if (id.startsWith(".") || id.startsWith("/")) return null;
      if (
        id.startsWith("npm:") || id.startsWith("jsr:") ||
        id.startsWith("http:") || id.startsWith("https:") ||
        id.startsWith("\0")
      ) return null;
      if (
        id.startsWith("@manifest/") ||
        id.startsWith("/@manifest") ||
        id.startsWith("virtual:") ||
        id.startsWith("$vinxi/") ||
        id.startsWith("vinxi:") ||
        id.startsWith("\0vite:")
      ) return null;

      const entry = matchImportMap(id, importMap);
      if (!entry) return null;
      if (!entry.absolutePath) return null;

      const resolved = resolveEntry(entry, id);
      return resolved;
    },

    load(id) {
      const [path, query] = id.split("?");
      if (path.startsWith("/@manifest") && path.endsWith("assets")) {
        const params = new URLSearchParams(query ?? "");
        if (!params.get("id")) {
          return { code: "export default []", moduleType: "js" };
        }
      }
      return null;
    },
  };
}
