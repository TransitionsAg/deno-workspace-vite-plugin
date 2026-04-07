import { assertEquals, assertStrictEquals } from "@std/assert";
import { join } from "@std/path";
import { denoWorkspaceVitePlugin } from "./plugin.ts";

Deno.test("plugin has correct name and enforce", () => {
  const plugin = denoWorkspaceVitePlugin();
  assertEquals(plugin.name, "deno-workspace-resolver");
  assertEquals(plugin.enforce, "pre");
});

Deno.test("plugin returns empty config when no jsr imports", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "plugin-test-" });
  try {
    await Deno.writeTextFile(
      join(tmp, "deno.json"),
      JSON.stringify({
        workspace: ["./packages/*"],
      }),
    );

    const pkgDir = join(tmp, "packages", "core");
    await Deno.mkdir(pkgDir, { recursive: true });
    await Deno.writeTextFile(
      join(pkgDir, "deno.json"),
      JSON.stringify({ imports: {} }),
    );

    const plugin = denoWorkspaceVitePlugin({ root: tmp });
    const configFn = plugin.config as (config: { root: string }) =>
      | { resolve: { alias: Array<{ find: string; replacement: string }> } }
      | undefined;

    const result = configFn({ root: tmp });
    assertStrictEquals(result, undefined);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("plugin resolves jsr: imports from root deno.json", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "plugin-test-" });
  try {
    await Deno.writeTextFile(
      join(tmp, "deno.json"),
      JSON.stringify({
        imports: {
          "@std/assert": "jsr:@std/assert@^1.0",
        },
      }),
    );

    const nodeModulesDir = join(tmp, "node_modules", "@jsr", "std__assert");
    await Deno.mkdir(nodeModulesDir, { recursive: true });
    await Deno.writeTextFile(
      join(nodeModulesDir, "mod.ts"),
      "export const assertEquals = () => {};",
    );

    const plugin = denoWorkspaceVitePlugin({ root: tmp });
    const configFn = plugin.config as (config: { root: string }) =>
      | { resolve: { alias: Array<{ find: string; replacement: string }> } }
      | undefined;

    const result = configFn({ root: tmp });
    assertEquals(result?.resolve.alias.length, 1);
    assertEquals(result?.resolve.alias[0].find, "@std/assert");
    assertEquals(result?.resolve.alias[0].replacement, nodeModulesDir);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("plugin resolves jsr: imports from workspace packages", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "plugin-test-" });
  try {
    await Deno.writeTextFile(
      join(tmp, "deno.json"),
      JSON.stringify({
        workspace: ["./packages/*"],
      }),
    );

    const pkgDir = join(tmp, "packages", "core");
    await Deno.mkdir(pkgDir, { recursive: true });
    await Deno.writeTextFile(
      join(pkgDir, "deno.json"),
      JSON.stringify({
        imports: {
          "@std/assert": "jsr:@std/assert@^1.0",
        },
      }),
    );

    const nodeModulesDir = join(tmp, "node_modules", "@jsr", "std__assert");
    await Deno.mkdir(nodeModulesDir, { recursive: true });
    await Deno.writeTextFile(
      join(nodeModulesDir, "mod.ts"),
      "export const assertEquals = () => {};",
    );

    const plugin = denoWorkspaceVitePlugin({ root: tmp });
    const configFn = plugin.config as (config: { root: string }) =>
      | { resolve: { alias: Array<{ find: string; replacement: string }> } }
      | undefined;

    const result = configFn({ root: tmp });
    assertEquals(result?.resolve.alias.length, 1);
    assertEquals(result?.resolve.alias[0].find, "@std/assert");
    assertEquals(result?.resolve.alias[0].replacement, nodeModulesDir);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("plugin handles multiple workspace packages", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "plugin-test-" });
  try {
    await Deno.writeTextFile(
      join(tmp, "deno.json"),
      JSON.stringify({
        workspace: ["./packages/*"],
      }),
    );

    const coreDir = join(tmp, "packages", "core");
    const uiDir = join(tmp, "packages", "ui");
    await Deno.mkdir(coreDir, { recursive: true });
    await Deno.mkdir(uiDir, { recursive: true });

    await Deno.writeTextFile(
      join(coreDir, "deno.json"),
      JSON.stringify({
        imports: {
          "@std/assert": "jsr:@std/assert@^1.0",
        },
      }),
    );

    await Deno.writeTextFile(
      join(uiDir, "deno.json"),
      JSON.stringify({
        imports: {
          "@std/fs": "jsr:@std/fs@^1.0",
        },
      }),
    );

    const assertDir = join(tmp, "node_modules", "@jsr", "std__assert");
    const fsDir = join(tmp, "node_modules", "@jsr", "std__fs");
    await Deno.mkdir(assertDir, { recursive: true });
    await Deno.mkdir(fsDir, { recursive: true });
    await Deno.writeTextFile(join(assertDir, "mod.ts"), "");
    await Deno.writeTextFile(join(fsDir, "mod.ts"), "");

    const plugin = denoWorkspaceVitePlugin({ root: tmp });
    const configFn = plugin.config as (config: { root: string }) =>
      | { resolve: { alias: Array<{ find: string; replacement: string }> } }
      | undefined;

    const result = configFn({ root: tmp });
    assertEquals(result?.resolve.alias.length, 2);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("plugin skips jsr: imports when package not in node_modules", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "plugin-test-" });
  try {
    await Deno.writeTextFile(
      join(tmp, "deno.json"),
      JSON.stringify({
        imports: {
          "@std/assert": "jsr:@std/assert@^1.0",
        },
      }),
    );

    const plugin = denoWorkspaceVitePlugin({ root: tmp });
    const configFn = plugin.config as (config: { root: string }) =>
      | { resolve: { alias: Array<{ find: string; replacement: string }> } }
      | undefined;

    const result = configFn({ root: tmp });
    assertStrictEquals(result, undefined);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("plugin handles deno.jsonc files", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "plugin-test-" });
  try {
    await Deno.writeTextFile(
      join(tmp, "deno.jsonc"),
      `{
        // comment
        "imports": {
          "@std/assert": "jsr:@std/assert@^1.0",
        },
      }`,
    );

    const nodeModulesDir = join(tmp, "node_modules", "@jsr", "std__assert");
    await Deno.mkdir(nodeModulesDir, { recursive: true });
    await Deno.writeTextFile(join(nodeModulesDir, "mod.ts"), "");

    const plugin = denoWorkspaceVitePlugin({ root: tmp });
    const configFn = plugin.config as (config: { root: string }) =>
      | { resolve: { alias: Array<{ find: string; replacement: string }> } }
      | undefined;

    const result = configFn({ root: tmp });
    assertEquals(result?.resolve.alias.length, 1);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("plugin handles missing deno.json gracefully", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "plugin-test-" });
  try {
    const plugin = denoWorkspaceVitePlugin({ root: tmp });
    const configFn = plugin.config as (config: { root: string }) =>
      | { resolve: { alias: Array<{ find: string; replacement: string }> } }
      | undefined;

    const result = configFn({ root: tmp });
    assertStrictEquals(result, undefined);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});
