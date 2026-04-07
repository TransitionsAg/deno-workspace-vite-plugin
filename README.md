# @transitionsag/deno-workspace-vite-plugin

A Vite plugin that resolves local workspace-relative import paths defined in
`deno.json` import maps, enabling Vite to understand Deno workspace imports.

## Why This Exists

Deno workspaces use import maps in `deno.json` to define aliases for local
packages. Vite running in a Node.js context doesn't natively understand these
import maps. This plugin bridges that gap by reading workspace configurations
and resolving import specifiers to absolute file paths.

## Installation

```bash
deno add jsr:@transitionsag/deno-workspace-vite-plugin
```

## Usage

Add the plugin to your Vite configuration, **before** `@deno/vite-plugin`:

```ts
import { defineConfig } from "vite";
import { denoWorkspaceVitePlugin } from "@transitionsag/deno-workspace-vite-plugin";
import deno from "@deno/vite-plugin";

export default defineConfig({
  vite: {
    plugins: [
      denoWorkspaceVitePlugin(),
      deno(),
    ],
  },
});
```

### With SolidStart

```ts
import { defineConfig } from "@solidjs/start/config";
import deno from "@deno/vite-plugin";
import { denoWorkspaceVitePlugin } from "@transitionsag/deno-workspace-vite-plugin";

export default defineConfig({
  vite: {
    plugins: [
      denoWorkspaceVitePlugin(),
      deno(),
    ],
  },
});
```

## Configuration

```ts
denoWorkspaceVitePlugin({
  root?: string, // Directory to start searching for deno.json. Defaults to Vite's config.root
  resolveJsrDependencies?: boolean, // Resolve jsr: imports to node_modules/@jsr/... paths. Defaults to false
})
```

## How It Works

1. **Workspace Discovery**: Walks up from the project root to find `deno.json`
   or `deno.jsonc` with a `"workspace"` field
2. **Member Expansion**: Expands glob patterns (e.g. `"./packages/*"`,
   `"./apps/*"`) to actual directories
3. **Import Map Collection**: Reads `"imports"` from each workspace member's
   config, keeping only local file targets (filters out `npm:`, `jsr:`, `http:`,
   `https:`)
4. **JSR Resolution (optional)**: When `resolveJsrDependencies: true`, resolves
   `jsr:` imports to `node_modules/@jsr/...` paths for Vite compatibility
5. **Resolution**: Intercepts imports via Vite's `resolveId` hook with
   `enforce: "pre"`, matches against the collected import map, and resolves to
   absolute paths with automatic extension fallback

## Supported Features

- **JSONC parsing**: Supports both `deno.json` and `deno.jsonc` (JSON with
  comments)
- **Subpath imports**: Supports prefix matching for subpath imports like
  `@scope/pkg/sub/module`
- **Extension resolution**: Automatically tries `.ts`, `.tsx`, `.js`, `.jsx`,
  `.mjs`, `.cjs` and index files (`mod.ts`, `mod.tsx`, `index.ts`, `index.tsx`)
- **Glob patterns**: Supports glob patterns in workspace member definitions

## Public API

### `denoWorkspaceVitePlugin(options?)`

Returns a Vite plugin that resolves workspace import map entries.

### `findWorkspaceRoot(startDir)`

Walks up from `startDir` to find a `deno.json` with a `"workspace"` field.
Returns `WorkspaceConfig | null`.

### `expandMembers(workspace)`

Expands glob patterns in `workspace.members` to actual directory paths.

### `collectImportMap(memberDirs)`

Reads `imports` from each member's `deno.json`/`deno.jsonc`, returning an
`ImportMap`.

### `matchImportMap(id, importMap)`

Finds the best matching import map entry for a given import specifier. Supports
exact match and longest prefix match for subpath imports.

### `resolveEntry(entry, id)`

Resolves a matched entry to an absolute file path with extension and index file
fallback.

## Types

```ts
interface DenoWorkspaceVitePluginOptions {
  root?: string;
  resolveJsrDependencies?: boolean;
}

interface WorkspaceConfig {
  rootDir: string;
  members: string[];
}

interface ImportMap {
  entries: Map<string, ImportMapEntry>;
}

interface ImportMapEntry {
  key: string;
  target: string;
  absolutePath: string | null;
  sourceConfig: string;
}
```

## Example Workspace Structure

```
my-workspace/
├── deno.json              # { "workspace": ["./packages/*", "./apps/*"] }
├── packages/
│   └── shared/
│       ├── deno.json      # { "name": "@workspace/shared", "imports": { "@shared/": "./src/" } }
│       └── src/
│           └── utils.ts
└── apps/
    └── web/
        ├── deno.json      # { "imports": { "@shared/": "../../packages/shared/src/" } }
        └── vite.config.ts # Uses denoWorkspaceVitePlugin()
```

With this setup, imports like `@shared/utils` in the web app will be resolved to
the correct file in the shared package.

## License

MIT
