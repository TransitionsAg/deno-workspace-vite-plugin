import { assertEquals, assertStrictEquals } from "@std/assert";
import { join } from "@std/path";
import { denoWorkspaceVitePlugin } from "./plugin.ts";

Deno.test("plugin has correct name and enforce", () => {
  const plugin = denoWorkspaceVitePlugin();
  assertEquals(plugin.name, "deno-workspace-resolver");
  assertEquals(plugin.enforce, "pre");
});

Deno.test("plugin resolveId skips relative paths", () => {
  const plugin = denoWorkspaceVitePlugin();
  const resolveId = plugin.resolveId as (id: string) => string | null;

  assertStrictEquals(resolveId("./local-module"), null);
  assertStrictEquals(resolveId("../parent-module"), null);
  assertStrictEquals(resolveId("/absolute/path"), null);
});

Deno.test("plugin resolveId skips external schemes", () => {
  const plugin = denoWorkspaceVitePlugin();
  const resolveId = plugin.resolveId as (id: string) => string | null;

  assertStrictEquals(resolveId("npm:lodash"), null);
  assertStrictEquals(resolveId("jsr:@std/fs"), null);
  assertStrictEquals(resolveId("http://example.com/mod.ts"), null);
  assertStrictEquals(resolveId("https://esm.sh/react"), null);
  assertStrictEquals(resolveId("\0virtual-module"), null);
});

Deno.test("plugin resolveId returns null when no workspace found", () => {
  const plugin = denoWorkspaceVitePlugin();
  const resolveId = plugin.resolveId as (id: string) => string | null;

  const result = resolveId("@some/package");
  assertStrictEquals(result, null);
});

Deno.test("plugin resolves workspace imports after configResolved", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "plugin-test-" });
  try {
    const pkgDir = join(tmp, "packages", "shared");
    await Deno.mkdir(pkgDir, { recursive: true });
    await Deno.mkdir(join(pkgDir, "src"), { recursive: true });

    await Deno.writeTextFile(
      join(tmp, "deno.json"),
      JSON.stringify({
        workspace: ["./packages/*"],
      }),
    );

    await Deno.writeTextFile(
      join(pkgDir, "deno.json"),
      JSON.stringify({
        name: "@test/shared",
        imports: {
          "@shared/": "./src/",
        },
      }),
    );

    await Deno.writeTextFile(
      join(pkgDir, "src", "utils.ts"),
      "export const hello = 'world';",
    );

    const plugin = denoWorkspaceVitePlugin({ root: tmp });
    await (plugin.configResolved as (
      config: { root: string },
    ) => Promise<void>)({ root: tmp });

    const resolveId = plugin.resolveId as (id: string) => string | null;
    const result = resolveId("@shared/utils");
    assertEquals(result, join(pkgDir, "src", "utils.ts"));
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("plugin resolves exact import match", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "plugin-test-" });
  try {
    const pkgDir = join(tmp, "packages", "utils");
    await Deno.mkdir(pkgDir, { recursive: true });

    await Deno.writeTextFile(
      join(tmp, "deno.json"),
      JSON.stringify({
        workspace: ["./packages/*"],
      }),
    );

    await Deno.writeTextFile(
      join(pkgDir, "deno.json"),
      JSON.stringify({
        imports: {
          "@utils": "./index.ts",
        },
      }),
    );

    await Deno.writeTextFile(
      join(pkgDir, "index.ts"),
      "export const version = '1.0.0';",
    );

    const plugin = denoWorkspaceVitePlugin({ root: tmp });
    await (plugin.configResolved as (
      config: { root: string },
    ) => Promise<void>)({ root: tmp });

    const resolveId = plugin.resolveId as (id: string) => string | null;
    const result = resolveId("@utils");
    assertEquals(result, join(pkgDir, "index.ts"));
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("plugin resolves subpath imports", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "plugin-test-" });
  try {
    const pkgDir = join(tmp, "packages", "core");
    await Deno.mkdir(pkgDir, { recursive: true });
    await Deno.mkdir(join(pkgDir, "lib"), { recursive: true });

    await Deno.writeTextFile(
      join(tmp, "deno.json"),
      JSON.stringify({
        workspace: ["./packages/*"],
      }),
    );

    await Deno.writeTextFile(
      join(pkgDir, "deno.json"),
      JSON.stringify({
        imports: {
          "@core/": "./lib/",
        },
      }),
    );

    await Deno.writeTextFile(
      join(pkgDir, "lib", "helpers.ts"),
      "export const help = () => {};",
    );

    const plugin = denoWorkspaceVitePlugin({ root: tmp });
    await (plugin.configResolved as (
      config: { root: string },
    ) => Promise<void>)({ root: tmp });

    const resolveId = plugin.resolveId as (id: string) => string | null;
    const result = resolveId("@core/helpers");
    assertEquals(result, join(pkgDir, "lib", "helpers.ts"));
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("plugin returns null for unmatched imports", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "plugin-test-" });
  try {
    const pkgDir = join(tmp, "packages", "shared");
    await Deno.mkdir(pkgDir, { recursive: true });

    await Deno.writeTextFile(
      join(tmp, "deno.json"),
      JSON.stringify({
        workspace: ["./packages/*"],
      }),
    );

    await Deno.writeTextFile(
      join(pkgDir, "deno.json"),
      JSON.stringify({
        imports: {
          "@shared/": "./src/",
        },
      }),
    );

    const plugin = denoWorkspaceVitePlugin({ root: tmp });
    await (plugin.configResolved as (
      config: { root: string },
    ) => Promise<void>)({ root: tmp });

    const resolveId = plugin.resolveId as (id: string) => string | null;
    const result = resolveId("@unknown/package");
    assertStrictEquals(result, null);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("plugin initialized flag prevents re-initialization", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "plugin-test-" });
  try {
    const pkgDir = join(tmp, "packages", "shared");
    await Deno.mkdir(pkgDir, { recursive: true });
    await Deno.mkdir(join(pkgDir, "src"), { recursive: true });

    await Deno.writeTextFile(
      join(tmp, "deno.json"),
      JSON.stringify({
        workspace: ["./packages/*"],
      }),
    );

    await Deno.writeTextFile(
      join(pkgDir, "deno.json"),
      JSON.stringify({
        imports: {
          "@shared/": "./src/",
        },
      }),
    );

    await Deno.writeTextFile(
      join(pkgDir, "src", "mod.ts"),
      "export const a = 1;",
    );

    const plugin = denoWorkspaceVitePlugin({ root: tmp });

    await (plugin.configResolved as (
      config: { root: string },
    ) => Promise<void>)({ root: tmp });
    await (plugin.configResolved as (
      config: { root: string },
    ) => Promise<void>)({ root: tmp });
    await (plugin.configResolved as (
      config: { root: string },
    ) => Promise<void>)({ root: tmp });

    const resolveId = plugin.resolveId as (id: string) => string | null;
    const result = resolveId("@shared/mod");
    assertEquals(result, join(pkgDir, "src", "mod.ts"));
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("plugin resolves imports from package.json (vinxi/solid-start pattern)", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "plugin-test-" });
  try {
    const pkgDir = join(tmp, "packages", "seeds-form");
    await Deno.mkdir(pkgDir, { recursive: true });
    await Deno.mkdir(join(pkgDir, "src", "resolver"), { recursive: true });

    await Deno.writeTextFile(
      join(tmp, "deno.json"),
      JSON.stringify({
        workspace: ["./packages/*"],
      }),
    );

    await Deno.writeTextFile(
      join(pkgDir, "package.json"),
      JSON.stringify({
        name: "@transitionsag/seeds-form",
        imports: {
          "@transitionsag/seeds-form": "./src/mod.ts",
          "@transitionsag/seeds-form/resolver/zod": "./src/resolver/zod.ts",
        },
      }),
    );

    await Deno.writeTextFile(
      join(pkgDir, "src", "mod.ts"),
      "export const form = {};",
    );

    await Deno.writeTextFile(
      join(pkgDir, "src", "resolver", "zod.ts"),
      "export const zodResolver = {};",
    );

    const plugin = denoWorkspaceVitePlugin({ root: tmp });
    await (plugin.configResolved as (
      config: { root: string },
    ) => Promise<void>)({ root: tmp });

    const resolveId = plugin.resolveId as (id: string) => string | null;

    const mainResult = resolveId("@transitionsag/seeds-form");
    assertEquals(mainResult, join(pkgDir, "src", "mod.ts"));

    const zodResult = resolveId("@transitionsag/seeds-form/resolver/zod");
    assertEquals(zodResult, join(pkgDir, "src", "resolver", "zod.ts"));
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("plugin resolves CSS imports from workspace packages", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "plugin-test-" });
  try {
    const pkgDir = join(tmp, "packages", "bloom");
    await Deno.mkdir(pkgDir, { recursive: true });
    await Deno.mkdir(join(pkgDir, "src"), { recursive: true });

    await Deno.writeTextFile(
      join(tmp, "deno.json"),
      JSON.stringify({
        workspace: ["./packages/*"],
      }),
    );

    await Deno.writeTextFile(
      join(pkgDir, "package.json"),
      JSON.stringify({
        name: "@transitionsag/seeds-bloom",
        imports: {
          "@transitionsag/seeds-bloom": "./src/mod.ts",
          "@transitionsag/seeds-bloom/styles.css": "./src/styles.css",
        },
      }),
    );

    await Deno.writeTextFile(
      join(pkgDir, "src", "mod.ts"),
      "export const bloom = {};",
    );

    await Deno.writeTextFile(
      join(pkgDir, "src", "styles.css"),
      ".bloom { color: green; }",
    );

    const plugin = denoWorkspaceVitePlugin({ root: tmp });
    await (plugin.configResolved as (
      config: { root: string },
    ) => Promise<void>)({ root: tmp });

    const resolveId = plugin.resolveId as (id: string) => string | null;

    const mainResult = resolveId("@transitionsag/seeds-bloom");
    assertEquals(mainResult, join(pkgDir, "src", "mod.ts"));

    const cssResult = resolveId("@transitionsag/seeds-bloom/styles.css");
    assertEquals(cssResult, join(pkgDir, "src", "styles.css"));
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("plugin returns null for nonexistent CSS import", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "plugin-test-" });
  try {
    const pkgDir = join(tmp, "packages", "bloom");
    await Deno.mkdir(pkgDir, { recursive: true });
    await Deno.mkdir(join(pkgDir, "src"), { recursive: true });

    await Deno.writeTextFile(
      join(tmp, "deno.json"),
      JSON.stringify({
        workspace: ["./packages/*"],
      }),
    );

    await Deno.writeTextFile(
      join(pkgDir, "package.json"),
      JSON.stringify({
        name: "@transitionsag/seeds-bloom",
        imports: {
          "@transitionsag/seeds-bloom": "./src/mod.ts",
          "@transitionsag/seeds-bloom/styles.css": "./src/styles.css",
        },
      }),
    );

    await Deno.writeTextFile(
      join(pkgDir, "src", "mod.ts"),
      "export const bloom = {};",
    );

    const plugin = denoWorkspaceVitePlugin({ root: tmp });
    await (plugin.configResolved as (
      config: { root: string },
    ) => Promise<void>)({ root: tmp });

    const resolveId = plugin.resolveId as (id: string) => string | null;

    const cssResult = resolveId("@transitionsag/seeds-bloom/styles.css");
    assertStrictEquals(cssResult, null);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});
