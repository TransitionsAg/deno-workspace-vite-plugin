import { assertEquals, assertNotEquals, assertStrictEquals } from "@std/assert";
import { join } from "@std/path";
import { collectImportMap } from "./import-map.ts";

// =============================================================================
// WORKSPACE:* INTEGRATION TESTS
// Simulates a SolidJS/vinxi monorepo with multiple packages using workspace:*
// =============================================================================

Deno.test("workspace:* resolves to another package's exports in the workspace", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "solid-workspace-test-" });
  try {
    // Root workspace config
    await Deno.writeTextFile(
      join(tmp, "deno.json"),
      JSON.stringify({
        workspace: ["./packages/*"],
      }),
    );

    // Package: @myapp/ui (UI component library)
    const uiDir = join(tmp, "packages", "ui");
    await Deno.mkdir(join(uiDir, "src"), { recursive: true });
    await Deno.writeTextFile(
      join(uiDir, "deno.json"),
      JSON.stringify({
        name: "@myapp/ui",
        exports: {
          ".": "./src/mod.tsx",
          "./button": "./src/button.tsx",
        },
      }),
    );
    await Deno.writeTextFile(
      join(uiDir, "src", "mod.tsx"),
      "export { Button } from './button.tsx';",
    );
    await Deno.writeTextFile(
      join(uiDir, "src", "button.tsx"),
      "export function Button() { return <button>Click</button>; }",
    );

    // Package: @myapp/form (uses workspace:* to reference @myapp/ui)
    const formDir = join(tmp, "packages", "form");
    await Deno.mkdir(join(formDir, "src"), { recursive: true });
    await Deno.writeTextFile(
      join(formDir, "deno.json"),
      JSON.stringify({
        name: "@myapp/form",
        exports: {
          ".": "./src/mod.tsx",
        },
        imports: {
          "@myapp/ui": "workspace:*",
        },
      }),
    );
    await Deno.writeTextFile(
      join(formDir, "src", "mod.tsx"),
      "import { Button } from '@myapp/ui';\nexport function Form() { return <Button />; }",
    );

    // Collect import map from workspace root
    const importMap = await collectImportMap([], tmp);

    // The workspace:* import should be resolved to @myapp/ui's actual path
    const uiEntry = importMap.entries.get("@myapp/ui");
    assertNotEquals(
      uiEntry,
      undefined,
      "@myapp/ui should be in the import map",
    );
    assertEquals(
      uiEntry!.absolutePath,
      join(uiDir, "src", "mod.tsx"),
      "workspace:* should resolve to the exported entry point",
    );

    // Subpath export should also work
    const buttonEntry = importMap.entries.get("@myapp/ui/button");
    assertNotEquals(buttonEntry, undefined);
    assertEquals(buttonEntry!.absolutePath, join(uiDir, "src", "button.tsx"));

    // Form package's own exports
    const formEntry = importMap.entries.get("@myapp/form");
    assertNotEquals(formEntry, undefined);
    assertEquals(formEntry!.absolutePath, join(formDir, "src", "mod.tsx"));
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("workspace:* resolves package.json exports for vinxi/solid-start apps", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "vinxi-workspace-test-" });
  try {
    await Deno.writeTextFile(
      join(tmp, "deno.json"),
      JSON.stringify({
        workspace: ["./packages/*", "./apps/*"],
      }),
    );

    // Shared UI package
    const uiDir = join(tmp, "packages", "ui");
    await Deno.mkdir(join(uiDir, "src"), { recursive: true });
    await Deno.writeTextFile(
      join(uiDir, "package.json"),
      JSON.stringify({
        name: "@myapp/ui",
        exports: {
          ".": "./src/index.tsx",
          "./styles.css": "./src/styles.css",
        },
      }),
    );
    await Deno.writeTextFile(
      join(uiDir, "src", "index.tsx"),
      "export function Card() { return <div>Card</div>; }",
    );
    await Deno.writeTextFile(
      join(uiDir, "src", "styles.css"),
      ".card { padding: 1rem; }",
    );

    // Solid-start app that uses workspace:*
    const appDir = join(tmp, "apps", "web");
    await Deno.mkdir(join(appDir, "src", "routes"), { recursive: true });
    await Deno.writeTextFile(
      join(appDir, "package.json"),
      JSON.stringify({
        name: "@myapp/web",
        type: "module",
        imports: {
          "@myapp/ui": "workspace:*",
          "@myapp/ui/styles.css": "workspace:*",
        },
      }),
    );
    await Deno.writeTextFile(
      join(appDir, "src", "routes", "index.tsx"),
      "import { Card } from '@myapp/ui';\nexport default function Home() { return <Card />; }",
    );

    const importMap = await collectImportMap([], tmp);

    // workspace:* should resolve to the actual package exports
    const uiEntry = importMap.entries.get("@myapp/ui");
    assertNotEquals(uiEntry, undefined);
    assertEquals(uiEntry!.absolutePath, join(uiDir, "src", "index.tsx"));

    const cssEntry = importMap.entries.get("@myapp/ui/styles.css");
    assertNotEquals(cssEntry, undefined);
    assertEquals(cssEntry!.absolutePath, join(uiDir, "src", "styles.css"));
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("workspace:* with subpath exports (conditional exports pattern)", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "workspace-subpath-test-" });
  try {
    await Deno.writeTextFile(
      join(tmp, "deno.json"),
      JSON.stringify({
        workspace: ["./packages/*"],
      }),
    );

    // Package with multiple export paths
    const pkgDir = join(tmp, "packages", "utils");
    await Deno.mkdir(join(pkgDir, "src"), { recursive: true });
    await Deno.mkdir(join(pkgDir, "src", "form"), { recursive: true });
    await Deno.writeTextFile(
      join(pkgDir, "deno.json"),
      JSON.stringify({
        name: "@myapp/utils",
        exports: {
          ".": "./src/mod.ts",
          "./form": "./src/form/mod.ts",
          "./form/zod": "./src/form/zod.ts",
        },
      }),
    );
    await Deno.writeTextFile(
      join(pkgDir, "src", "mod.ts"),
      "export const VERSION = '1.0.0';",
    );
    await Deno.writeTextFile(
      join(pkgDir, "src", "form", "mod.ts"),
      "export function useForm() {}",
    );
    await Deno.writeTextFile(
      join(pkgDir, "src", "form", "zod.ts"),
      "export function zodResolver() {}",
    );

    // Another package using workspace:*
    const consumerDir = join(tmp, "packages", "auth");
    await Deno.mkdir(join(consumerDir, "src"), { recursive: true });
    await Deno.writeTextFile(
      join(consumerDir, "deno.json"),
      JSON.stringify({
        name: "@myapp/auth",
        exports: {
          ".": "./src/mod.ts",
        },
        imports: {
          "@myapp/utils": "workspace:*",
          "@myapp/utils/form": "workspace:*",
          "@myapp/utils/form/zod": "workspace:*",
        },
      }),
    );
    await Deno.writeTextFile(
      join(consumerDir, "src", "mod.ts"),
      "import { VERSION } from '@myapp/utils';\nimport { useForm } from '@myapp/utils/form';",
    );

    const importMap = await collectImportMap([], tmp);

    const mainEntry = importMap.entries.get("@myapp/utils");
    assertNotEquals(mainEntry, undefined);
    assertEquals(mainEntry!.absolutePath, join(pkgDir, "src", "mod.ts"));

    const formEntry = importMap.entries.get("@myapp/utils/form");
    assertNotEquals(formEntry, undefined);
    assertEquals(
      formEntry!.absolutePath,
      join(pkgDir, "src", "form", "mod.ts"),
    );

    const zodEntry = importMap.entries.get("@myapp/utils/form/zod");
    assertNotEquals(zodEntry, undefined);
    assertEquals(zodEntry!.absolutePath, join(pkgDir, "src", "form", "zod.ts"));
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("workspace:* ignores non-existent package gracefully", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "workspace-missing-test-" });
  try {
    await Deno.writeTextFile(
      join(tmp, "deno.json"),
      JSON.stringify({
        workspace: ["./packages/*"],
      }),
    );

    const pkgDir = join(tmp, "packages", "app");
    await Deno.mkdir(join(pkgDir, "src"), { recursive: true });
    await Deno.writeTextFile(
      join(pkgDir, "deno.json"),
      JSON.stringify({
        name: "@myapp/app",
        exports: {
          ".": "./src/mod.ts",
        },
        imports: {
          "@myapp/does-not-exist": "workspace:*",
        },
      }),
    );
    await Deno.writeTextFile(join(pkgDir, "src", "mod.ts"), "export {};");

    const importMap = await collectImportMap([], tmp);

    // The missing package should NOT be in the map (gracefully skipped)
    const missingEntry = importMap.entries.get("@myapp/does-not-exist");
    assertStrictEquals(missingEntry, undefined);

    // But the package's own exports should still work
    const appEntry = importMap.entries.get("@myapp/app");
    assertNotEquals(appEntry, undefined);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("workspace:* mixed with regular imports and exports", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "workspace-mixed-test-" });
  try {
    await Deno.writeTextFile(
      join(tmp, "deno.json"),
      JSON.stringify({
        workspace: ["./packages/*"],
      }),
    );

    // Package A: provides UI components
    const pkgADir = join(tmp, "packages", "ui");
    await Deno.mkdir(join(pkgADir, "src"), { recursive: true });
    await Deno.writeTextFile(
      join(pkgADir, "deno.json"),
      JSON.stringify({
        name: "@myapp/ui",
        exports: {
          ".": "./src/mod.tsx",
        },
        imports: {
          "@shared/": "./src/shared/",
        },
      }),
    );
    await Deno.mkdir(join(pkgADir, "src", "shared"), { recursive: true });
    await Deno.writeTextFile(
      join(pkgADir, "src", "mod.tsx"),
      "export function UI() {}",
    );
    await Deno.writeTextFile(
      join(pkgADir, "src", "shared", "colors.ts"),
      "export const RED = '#ff0000';",
    );

    // Package B: uses workspace:* for A, plus regular imports
    const pkgBDir = join(tmp, "packages", "dashboard");
    await Deno.mkdir(join(pkgBDir, "src"), { recursive: true });
    await Deno.writeTextFile(
      join(pkgBDir, "deno.json"),
      JSON.stringify({
        name: "@myapp/dashboard",
        exports: {
          ".": "./src/mod.tsx",
        },
        imports: {
          "@myapp/ui": "workspace:*",
          "@dashboard/": "./src/",
        },
      }),
    );
    await Deno.writeTextFile(
      join(pkgBDir, "src", "mod.tsx"),
      "import { UI } from '@myapp/ui';\nimport { RED } from '@shared/colors';",
    );

    const importMap = await collectImportMap([], tmp);

    // workspace:* resolution
    const uiEntry = importMap.entries.get("@myapp/ui");
    assertNotEquals(uiEntry, undefined);
    assertEquals(uiEntry!.absolutePath, join(pkgADir, "src", "mod.tsx"));

    // Regular import resolution
    const sharedEntry = importMap.entries.get("@shared/");
    assertNotEquals(sharedEntry, undefined);
    assertEquals(sharedEntry!.target, "./src/shared/");

    // Dashboard's own imports
    const dashboardEntry = importMap.entries.get("@dashboard/");
    assertNotEquals(dashboardEntry, undefined);
    assertEquals(dashboardEntry!.target, "./src/");

    // Dashboard's own exports
    const dashboardExport = importMap.entries.get("@myapp/dashboard");
    assertNotEquals(dashboardExport, undefined);
    assertEquals(
      dashboardExport!.absolutePath,
      join(pkgBDir, "src", "mod.tsx"),
    );
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("workspace:* resolves CSS export for Tailwind/Vite integration", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "tailwind-workspace-test-" });
  try {
    const { denoWorkspaceVitePlugin } = await import("./plugin.ts");

    await Deno.writeTextFile(
      join(tmp, "deno.json"),
      JSON.stringify({
        workspace: ["./packages/*"],
      }),
    );

    // UI package exports Tailwind-enabled styles.css
    const uiDir = join(tmp, "packages", "ui");
    await Deno.mkdir(join(uiDir, "src"), { recursive: true });
    await Deno.writeTextFile(
      join(uiDir, "deno.json"),
      JSON.stringify({
        name: "@myapp/ui",
        exports: {
          ".": "./src/mod.tsx",
          "./styles.css": "./src/styles.css",
        },
      }),
    );
    await Deno.writeTextFile(
      join(uiDir, "src", "mod.tsx"),
      "export function Button() { return <button class='btn' />; }",
    );
    await Deno.writeTextFile(
      join(uiDir, "src", "styles.css"),
      "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n.btn { @apply px-4 py-2 rounded; }",
    );

    // App imports CSS from UI package via workspace:*
    const appDir = join(tmp, "packages", "app");
    await Deno.mkdir(join(appDir, "src"), { recursive: true });
    await Deno.writeTextFile(
      join(appDir, "deno.json"),
      JSON.stringify({
        name: "@myapp/app",
        exports: {
          ".": "./src/mod.tsx",
        },
        imports: {
          "@myapp/ui": "workspace:*",
          "@myapp/ui/styles.css": "workspace:*",
        },
      }),
    );
    await Deno.writeTextFile(
      join(appDir, "src", "mod.tsx"),
      "import '@myapp/ui/styles.css';\nimport { Button } from '@myapp/ui';",
    );

    const plugin = denoWorkspaceVitePlugin({ root: tmp });
    await (plugin.configResolved as (
      config: { root: string },
    ) => Promise<void>)({ root: tmp });

    const resolveId = plugin.resolveId as (id: string) => string | null;

    // CSS file should resolve to absolute path
    const cssResult = resolveId("@myapp/ui/styles.css");
    assertEquals(cssResult, join(uiDir, "src", "styles.css"));

    // TSX should also resolve
    const tsxResult = resolveId("@myapp/ui");
    assertEquals(tsxResult, join(uiDir, "src", "mod.tsx"));

    // Verify CSS transform handles @import with workspace package key
    const transform = plugin.transform as (
      code: string,
      id: string,
    ) => { code: string; map: null } | null;

    const cssWithImport =
      `@import "@myapp/ui/styles.css";\nbody { margin: 0; }`;
    const transformed = transform(cssWithImport, "/some/file.css");

    assertNotEquals(transformed, null);
    assertEquals(
      transformed!.code,
      `@import "${join(uiDir, "src", "styles.css")}";\nbody { margin: 0; }`,
    );
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});
