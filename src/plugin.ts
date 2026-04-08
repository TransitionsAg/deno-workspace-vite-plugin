import type { Plugin } from "vite";
import { join } from "@std/path";
import { parse as parseJsonc } from "@std/jsonc";

function jsrSpecifierToNpmPath(specifier: string): string {
  const rest = specifier.slice(4).replace(/@[\^~].*$/, "");
  if (rest.startsWith("@")) {
    return rest.slice(1).replace("/", "__");
  }
  return rest.replace("/", "__");
}

function readConfig(path: string): Record<string, unknown> | null {
  try {
    const content = Deno.readTextFileSync(path);
    return parseJsonc(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type AliasEntry = { find: string | RegExp; replacement: string };

function collectJsrAliases(root: string): AliasEntry[] {
  const denoJson = readConfig(join(root, "deno.json")) ??
    readConfig(join(root, "deno.jsonc"));
  if (!denoJson) return [];

  const aliases: AliasEntry[] = [];

  const processImports = (imports: Record<string, string>) => {
    for (const [alias, specifier] of Object.entries(imports)) {
      if (specifier.startsWith("jsr:")) {
        const npmName = jsrSpecifierToNpmPath(specifier);
        const npmPath = join(root, "node_modules", "@jsr", npmName);
        try {
          Deno.statSync(npmPath);
          aliases.push({ find: alias, replacement: npmPath });
        } catch {
          // skip
        }
      }
    }
  };

  if (denoJson.imports && typeof denoJson.imports === "object") {
    processImports(denoJson.imports as Record<string, string>);
  }

  const workspace = denoJson.workspace;
  if (Array.isArray(workspace)) {
    for (const pattern of workspace) {
      if (typeof pattern !== "string") continue;
      const baseDir = join(root, pattern.replace(/\/\*$/, ""));
      try {
        for (const entry of Deno.readDirSync(baseDir)) {
          if (entry.isDirectory) {
            const pkgPath = join(baseDir, entry.name);
            const pkgConfig = readConfig(join(pkgPath, "deno.json")) ??
              readConfig(join(pkgPath, "deno.jsonc"));
            if (pkgConfig?.imports && typeof pkgConfig.imports === "object") {
              processImports(pkgConfig.imports as Record<string, string>);
            }
          }
        }
      } catch {
        // skip
      }
    }
  }

  return aliases;
}

function collectWorkspaceAliases(root: string): AliasEntry[] {
  const denoJson = readConfig(join(root, "deno.json")) ??
    readConfig(join(root, "deno.jsonc"));
  if (!denoJson) return [];

  const workspace = denoJson.workspace;
  if (!Array.isArray(workspace)) return [];

  const aliases: AliasEntry[] = [];

  for (const pattern of workspace) {
    if (typeof pattern !== "string") continue;
    const baseDir = join(root, pattern.replace(/\/\*$/, ""));
    try {
      for (const entry of Deno.readDirSync(baseDir)) {
        if (!entry.isDirectory) continue;
        const pkgPath = join(baseDir, entry.name);
        const pkgConfig = readConfig(join(pkgPath, "deno.json")) ??
          readConfig(join(pkgPath, "deno.jsonc"));
        if (!pkgConfig) continue;

        const pkgName = pkgConfig.name;
        if (typeof pkgName !== "string") continue;

        let exports = pkgConfig.exports;
        if (typeof exports === "string") {
          exports = { ".": exports };
        }
        if (!exports || typeof exports !== "object") continue;

        for (
          const [exportKey, exportValue] of Object.entries(
            exports as Record<string, unknown>,
          )
        ) {
          if (typeof exportValue !== "string") continue;

          if (exportKey === ".") {
            aliases.push({
              find: pkgName,
              replacement: join(pkgPath, exportValue),
            });
          } else if (exportKey.includes("*")) {
            const subpath = exportKey.slice(2);
            const wildcardIdx = subpath.indexOf("*");
            const prefix = subpath.slice(0, wildcardIdx);
            const suffix = subpath.slice(wildcardIdx + 1);

            const importPrefix = `${pkgName}/${prefix}`;
            const replacementBase = join(pkgPath, exportValue.slice(2));
            const replacementWithCapture = replacementBase.replace(/\*/, "$1");

            aliases.push({
              find: new RegExp(
                `^${escapeRegex(importPrefix)}(.+?)${escapeRegex(suffix)}$`,
              ),
              replacement: replacementWithCapture,
            });
          } else {
            aliases.push({
              find: `${pkgName}${exportKey.slice(1)}`,
              replacement: join(pkgPath, exportValue),
            });
          }
        }
      }
    } catch {
      // skip
    }
  }

  return aliases;
}

export type DenoWorkspaceVitePluginOptions = {
  root?: string;
};

export function denoWorkspaceVitePlugin(
  options: DenoWorkspaceVitePluginOptions = {},
): Plugin {
  return {
    name: "deno-workspace-resolver",
    enforce: "pre",

    config(config) {
      const root = options.root ?? config.root ?? Deno.cwd();
      const allAliases = [
        ...collectJsrAliases(root),
        ...collectWorkspaceAliases(root),
      ];

      if (allAliases.length === 0) return;

      return {
        resolve: {
          alias: allAliases,
        },
      };
    },
  };
}
