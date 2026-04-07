# @transitionsag/deno-workspace-vite-plugin

A Vite plugin that resolves `jsr:` imports from `deno.json` import maps to
`node_modules/@jsr/...` paths for Vite compatibility.

## Why This Exists

Deno uses `jsr:` specifiers for JSR packages, but Vite running in a Node.js
context doesn't understand these. This plugin converts `jsr:` imports to their
npm-equivalent paths in `node_modules/@jsr/...`.

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
  plugins: [
    denoWorkspaceVitePlugin(),
    deno(),
  ],
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
  root?: string, // Monorepo root directory. Defaults to Vite's config.root
})
```

## How It Works

1. Reads `deno.json` (or `deno.jsonc`) from the root
2. Collects `jsr:` imports from the root config and all workspace packages
3. Resolves each to `node_modules/@jsr/<scope>__<package>` paths
4. Returns these as Vite `resolve.alias` configuration

## Example

Given root `deno.json`:

```json
{
  "workspace": ["./packages/*"],
  "imports": {
    "@std/assert": "jsr:@std/assert@^1.0"
  }
}
```

And `packages/core/deno.json`:

```json
{
  "imports": {
    "@std/fs": "jsr:@std/fs@^1.0"
  }
}
```

- `@std/assert` resolves to `<root>/node_modules/@jsr/std__assert`
- `@std/fs` resolves to `<root>/node_modules/@jsr/std__fs`

## Types

```ts
interface DenoWorkspaceVitePluginOptions {
  root?: string;
}
```

## License

MIT
