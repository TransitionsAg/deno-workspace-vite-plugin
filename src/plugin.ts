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

function collectJsrAliases(root: string): Record<string, string> {
  let denoJson = readConfig(join(root, "deno.json"));
  if (!denoJson) {
    denoJson = readConfig(join(root, "deno.jsonc"));
  }
  if (!denoJson) return {};

  const aliases: Record<string, string> = {};

  const processImports = (imports: Record<string, string>) => {
    for (const [alias, specifier] of Object.entries(imports)) {
      if (specifier.startsWith("jsr:")) {
        const npmName = jsrSpecifierToNpmPath(specifier);
        const npmPath = join(root, "node_modules", "@jsr", npmName);
        try {
          Deno.statSync(npmPath);
          aliases[alias] = npmPath;
        } catch {
          // Package not installed, skip
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
            let pkgConfig = readConfig(join(pkgPath, "deno.json"));
            if (!pkgConfig) {
              pkgConfig = readConfig(join(pkgPath, "deno.jsonc"));
            }
            if (pkgConfig?.imports && typeof pkgConfig.imports === "object") {
              processImports(pkgConfig.imports as Record<string, string>);
            }
          }
        }
      } catch {
        // Directory doesn't exist, skip
      }
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
      const aliases = collectJsrAliases(root);
      const aliasEntries = Object.entries(aliases);

      if (aliasEntries.length === 0) return;

      return {
        resolve: {
          alias: aliasEntries.map(([find, replacement]) => ({
            find,
            replacement,
          })),
        },
      };
    },
  };
}
