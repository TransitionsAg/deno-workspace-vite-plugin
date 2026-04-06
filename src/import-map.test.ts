import { assertEquals, assertNotEquals, assertStrictEquals } from "@std/assert";
import { join } from "@std/path";
import {
  collectImportMap,
  matchImportMap,
  resolveEntry,
} from "./import-map.ts";

Deno.test("collectImportMap reads imports from member directories", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "importmap-test-" });
  try {
    const pkgDir = join(tmp, "pkg-a");
    await Deno.mkdir(pkgDir, { recursive: true });
    await Deno.writeTextFile(
      join(pkgDir, "deno.json"),
      JSON.stringify({
        name: "@test/pkg-a",
        imports: {
          "@shared/": "./src/",
          "@utils": "./utils.ts",
        },
      }),
    );
    await Deno.mkdir(join(pkgDir, "src"), { recursive: true });
    await Deno.writeTextFile(
      join(pkgDir, "src", "mod.ts"),
      "export const a = 1;",
    );
    await Deno.writeTextFile(join(pkgDir, "utils.ts"), "export const b = 2;");

    const result = await collectImportMap([pkgDir]);
    assertEquals(result.entries.size, 2);

    const sharedEntry = result.entries.get("@shared/");
    assertNotEquals(sharedEntry, undefined);
    assertEquals(sharedEntry!.key, "@shared/");
    assertEquals(sharedEntry!.target, "./src/");

    const utilsEntry = result.entries.get("@utils");
    assertNotEquals(utilsEntry, undefined);
    assertEquals(utilsEntry!.key, "@utils");
    assertEquals(utilsEntry!.target, "./utils.ts");
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("collectImportMap filters out external targets", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "importmap-test-" });
  try {
    const pkgDir = join(tmp, "pkg-a");
    await Deno.mkdir(pkgDir, { recursive: true });
    await Deno.writeTextFile(
      join(pkgDir, "deno.json"),
      JSON.stringify({
        imports: {
          "@local/": "./src/",
          "react": "npm:react@^18",
          "std/": "jsr:@std/fs@^1",
          "lodash": "https://esm.sh/lodash",
        },
      }),
    );

    const result = await collectImportMap([pkgDir]);
    assertEquals(result.entries.size, 4);

    const localEntry = result.entries.get("@local/");
    assertNotEquals(localEntry!.absolutePath, null);

    const reactEntry = result.entries.get("react");
    assertStrictEquals(reactEntry!.absolutePath, null);

    const stdEntry = result.entries.get("std/");
    assertStrictEquals(stdEntry!.absolutePath, null);

    const lodashEntry = result.entries.get("lodash");
    assertStrictEquals(lodashEntry!.absolutePath, null);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("collectImportMap first-wins deduplication", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "importmap-test-" });
  try {
    const pkgA = join(tmp, "pkg-a");
    const pkgB = join(tmp, "pkg-b");
    await Deno.mkdir(pkgA, { recursive: true });
    await Deno.mkdir(pkgB, { recursive: true });

    await Deno.writeTextFile(
      join(pkgA, "deno.json"),
      JSON.stringify({ imports: { "@shared/": "./src/" } }),
    );
    await Deno.writeTextFile(
      join(pkgB, "deno.json"),
      JSON.stringify({ imports: { "@shared/": "./lib/" } }),
    );

    const result = await collectImportMap([pkgA, pkgB]);
    const entry = result.entries.get("@shared/");
    assertEquals(entry!.sourceConfig, join(pkgA, "deno.json"));
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("collectImportMap handles deno.jsonc", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "importmap-test-" });
  try {
    const pkgDir = join(tmp, "pkg-a");
    await Deno.mkdir(pkgDir, { recursive: true });
    await Deno.writeTextFile(
      join(pkgDir, "deno.jsonc"),
      `{
        // comment
        "imports": {
          "@shared/": "./src/"
        }
      }`,
    );

    const result = await collectImportMap([pkgDir]);
    assertEquals(result.entries.size, 1);
    assertNotEquals(result.entries.get("@shared/")!.absolutePath, null);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("collectImportMap handles empty directory", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "importmap-test-" });
  try {
    const pkgDir = join(tmp, "empty-pkg");
    await Deno.mkdir(pkgDir, { recursive: true });

    const result = await collectImportMap([pkgDir]);
    assertEquals(result.entries.size, 0);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("matchImportMap exact match", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "importmap-test-" });
  try {
    const pkgDir = join(tmp, "pkg-a");
    await Deno.mkdir(pkgDir, { recursive: true });
    await Deno.writeTextFile(
      join(pkgDir, "deno.json"),
      JSON.stringify({
        imports: {
          "@shared/": "./src/",
          "@utils": "./utils.ts",
        },
      }),
    );

    const importMap = await collectImportMap([pkgDir]);

    const entry = matchImportMap("@utils", importMap);
    assertNotEquals(entry, null);
    assertEquals(entry!.key, "@utils");
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("matchImportMap prefix match for subpath imports", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "importmap-test-" });
  try {
    const pkgDir = join(tmp, "pkg-a");
    await Deno.mkdir(pkgDir, { recursive: true });
    await Deno.writeTextFile(
      join(pkgDir, "deno.json"),
      JSON.stringify({
        imports: {
          "@shared/": "./src/",
        },
      }),
    );

    const importMap = await collectImportMap([pkgDir]);

    const entry = matchImportMap("@shared/utils", importMap);
    assertNotEquals(entry, null);
    assertEquals(entry!.key, "@shared/");
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("matchImportMap longest prefix match", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "importmap-test-" });
  try {
    const pkgDir = join(tmp, "pkg-a");
    await Deno.mkdir(pkgDir, { recursive: true });
    await Deno.writeTextFile(
      join(pkgDir, "deno.json"),
      JSON.stringify({
        imports: {
          "@shared/": "./src/",
          "@shared/utils/": "./src/utils/",
        },
      }),
    );

    const importMap = await collectImportMap([pkgDir]);

    const entry = matchImportMap("@shared/utils/helper", importMap);
    assertNotEquals(entry, null);
    assertEquals(entry!.key, "@shared/utils/");
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("matchImportMap returns null for no match", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "importmap-test-" });
  try {
    const pkgDir = join(tmp, "pkg-a");
    await Deno.mkdir(pkgDir, { recursive: true });
    await Deno.writeTextFile(
      join(pkgDir, "deno.json"),
      JSON.stringify({
        imports: {
          "@shared/": "./src/",
        },
      }),
    );

    const importMap = await collectImportMap([pkgDir]);

    const entry = matchImportMap("@unknown/pkg", importMap);
    assertStrictEquals(entry, null);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("resolveEntry returns absolute path for exact match", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "importmap-test-" });
  try {
    const pkgDir = join(tmp, "pkg-a");
    await Deno.mkdir(pkgDir, { recursive: true });
    const utilsPath = join(pkgDir, "utils.ts");
    await Deno.writeTextFile(
      join(pkgDir, "deno.json"),
      JSON.stringify({
        imports: {
          "@utils": "./utils.ts",
        },
      }),
    );
    await Deno.writeTextFile(utilsPath, "export const a = 1;");

    const importMap = await collectImportMap([pkgDir]);
    const entry = importMap.entries.get("@utils");
    assertNotEquals(entry, undefined);

    const resolved = resolveEntry(entry!, "@utils");
    assertEquals(resolved, utilsPath);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("resolveEntry resolves subpath with extension fallback", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "importmap-test-" });
  try {
    const pkgDir = join(tmp, "pkg-a");
    await Deno.mkdir(join(pkgDir, "src"), { recursive: true });
    const modPath = join(pkgDir, "src", "mod.ts");
    await Deno.writeTextFile(
      join(pkgDir, "deno.json"),
      JSON.stringify({
        imports: {
          "@pkg/": "./src/",
        },
      }),
    );
    await Deno.writeTextFile(modPath, "export const a = 1;");

    const importMap = await collectImportMap([pkgDir]);
    const entry = importMap.entries.get("@pkg/");

    const resolved = resolveEntry(entry!, "@pkg/mod");
    assertEquals(resolved, modPath);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("resolveEntry tries multiple extensions", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "importmap-test-" });
  try {
    const pkgDir = join(tmp, "pkg-a");
    await Deno.mkdir(join(pkgDir, "src"), { recursive: true });
    const utilsPath = join(pkgDir, "src", "utils.tsx");
    await Deno.writeTextFile(
      join(pkgDir, "deno.json"),
      JSON.stringify({
        imports: {
          "@pkg/": "./src/",
        },
      }),
    );
    await Deno.writeTextFile(utilsPath, "export const a = 1;");

    const importMap = await collectImportMap([pkgDir]);
    const entry = importMap.entries.get("@pkg/");

    const resolved = resolveEntry(entry!, "@pkg/utils");
    assertEquals(resolved, utilsPath);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("resolveEntry resolves index files", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "importmap-test-" });
  try {
    const pkgDir = join(tmp, "pkg-a");
    await Deno.mkdir(join(pkgDir, "src", "utils"), { recursive: true });
    const indexPath = join(pkgDir, "src", "utils", "index.ts");
    await Deno.writeTextFile(
      join(pkgDir, "deno.json"),
      JSON.stringify({
        imports: {
          "@pkg/": "./src/",
        },
      }),
    );
    await Deno.writeTextFile(indexPath, "export const a = 1;");

    const importMap = await collectImportMap([pkgDir]);
    const entry = importMap.entries.get("@pkg/");

    const resolved = resolveEntry(entry!, "@pkg/utils");
    assertEquals(resolved, indexPath);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("resolveEntry prefers mod.ts over index.ts", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "importmap-test-" });
  try {
    const pkgDir = join(tmp, "pkg-a");
    await Deno.mkdir(join(pkgDir, "src", "utils"), { recursive: true });
    const modPath = join(pkgDir, "src", "utils", "mod.ts");
    await Deno.writeTextFile(
      join(pkgDir, "deno.json"),
      JSON.stringify({
        imports: {
          "@pkg/": "./src/",
        },
      }),
    );
    await Deno.writeTextFile(modPath, "export const a = 1;");

    const importMap = await collectImportMap([pkgDir]);
    const entry = importMap.entries.get("@pkg/");

    const resolved = resolveEntry(entry!, "@pkg/utils");
    assertEquals(resolved, modPath);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("resolveEntry returns null for entry without absolutePath", () => {
  const entry = {
    key: "react",
    target: "npm:react@^18",
    absolutePath: null,
    sourceConfig: "/some/deno.json",
  };

  const resolved = resolveEntry(entry, "react");
  assertStrictEquals(resolved, null);
});

Deno.test("resolveEntry returns null for nonexistent exact match", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "importmap-test-" });
  try {
    const pkgDir = join(tmp, "pkg-a");
    await Deno.mkdir(pkgDir, { recursive: true });
    await Deno.writeTextFile(
      join(pkgDir, "deno.json"),
      JSON.stringify({
        imports: {
          "@pkg": "./nonexistent.ts",
        },
      }),
    );

    const importMap = await collectImportMap([pkgDir]);
    const entry = importMap.entries.get("@pkg");

    const resolved = resolveEntry(entry!, "@pkg");
    assertStrictEquals(resolved, null);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("resolveEntry returns null for nonexistent subpath", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "importmap-test-" });
  try {
    const pkgDir = join(tmp, "pkg-a");
    await Deno.mkdir(pkgDir, { recursive: true });
    await Deno.writeTextFile(
      join(pkgDir, "deno.json"),
      JSON.stringify({
        imports: {
          "@pkg/": "./src/",
        },
      }),
    );

    const importMap = await collectImportMap([pkgDir]);
    const entry = importMap.entries.get("@pkg/");

    const resolved = resolveEntry(entry!, "@pkg/nonexistent");
    assertStrictEquals(resolved, null);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("resolveEntry resolves CSS files", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "importmap-test-" });
  try {
    const pkgDir = join(tmp, "pkg-a");
    await Deno.mkdir(join(pkgDir, "src"), { recursive: true });
    const cssPath = join(pkgDir, "src", "styles.css");
    await Deno.writeTextFile(
      join(pkgDir, "deno.json"),
      JSON.stringify({
        imports: {
          "@pkg/": "./src/",
        },
      }),
    );
    await Deno.writeTextFile(cssPath, ".foo { color: red; }");

    const importMap = await collectImportMap([pkgDir]);
    const entry = importMap.entries.get("@pkg/");

    const resolved = resolveEntry(entry!, "@pkg/styles.css");
    assertEquals(resolved, cssPath);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("resolveEntry resolves exact CSS import match", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "importmap-test-" });
  try {
    const pkgDir = join(tmp, "pkg-a");
    await Deno.mkdir(pkgDir, { recursive: true });
    const cssPath = join(pkgDir, "styles.css");
    await Deno.writeTextFile(
      join(pkgDir, "deno.json"),
      JSON.stringify({
        imports: {
          "@pkg/styles.css": "./styles.css",
        },
      }),
    );
    await Deno.writeTextFile(cssPath, ".foo { color: red; }");

    const importMap = await collectImportMap([pkgDir]);
    const entry = importMap.entries.get("@pkg/styles.css");

    const resolved = resolveEntry(entry!, "@pkg/styles.css");
    assertEquals(resolved, cssPath);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("collectImportMap reads imports from package.json", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "importmap-test-" });
  try {
    const pkgDir = join(tmp, "pkg-a");
    await Deno.mkdir(join(pkgDir, "src"), { recursive: true });
    await Deno.writeTextFile(
      join(pkgDir, "package.json"),
      JSON.stringify({
        name: "@test/pkg-a",
        imports: {
          "@shared/": "./src/",
          "@utils": "./utils.ts",
        },
      }),
    );
    await Deno.writeTextFile(
      join(pkgDir, "src", "mod.ts"),
      "export const a = 1;",
    );
    await Deno.writeTextFile(join(pkgDir, "utils.ts"), "export const b = 2;");

    const result = await collectImportMap([pkgDir]);
    assertEquals(result.entries.size, 2);

    const sharedEntry = result.entries.get("@shared/");
    assertNotEquals(sharedEntry, undefined);
    assertEquals(sharedEntry!.key, "@shared/");
    assertEquals(sharedEntry!.target, "./src/");

    const utilsEntry = result.entries.get("@utils");
    assertNotEquals(utilsEntry, undefined);
    assertEquals(utilsEntry!.key, "@utils");
    assertEquals(utilsEntry!.target, "./utils.ts");
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("resolveEntry resolves TypeScript files from package.json imports", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "importmap-test-" });
  try {
    const pkgDir = join(tmp, "packages", "seeds-form");
    await Deno.mkdir(join(pkgDir, "src", "resolver"), { recursive: true });
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

    const importMap = await collectImportMap([pkgDir]);

    const mainEntry = importMap.entries.get("@transitionsag/seeds-form");
    const mainResolved = resolveEntry(mainEntry!, "@transitionsag/seeds-form");
    assertEquals(mainResolved, join(pkgDir, "src", "mod.ts"));

    const zodEntry = importMap.entries.get(
      "@transitionsag/seeds-form/resolver/zod",
    );
    const zodResolved = resolveEntry(
      zodEntry!,
      "@transitionsag/seeds-form/resolver/zod",
    );
    assertEquals(zodResolved, join(pkgDir, "src", "resolver", "zod.ts"));
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("resolveEntry resolves CSS from package.json imports (vinxi/solid-start pattern)", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "importmap-test-" });
  try {
    const pkgDir = join(tmp, "packages", "bloom");
    await Deno.mkdir(join(pkgDir, "src"), { recursive: true });
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

    const importMap = await collectImportMap([pkgDir]);

    const mainEntry = importMap.entries.get("@transitionsag/seeds-bloom");
    const mainResolved = resolveEntry(mainEntry!, "@transitionsag/seeds-bloom");
    assertEquals(mainResolved, join(pkgDir, "src", "mod.ts"));

    const cssEntry = importMap.entries.get(
      "@transitionsag/seeds-bloom/styles.css",
    );
    const cssResolved = resolveEntry(
      cssEntry!,
      "@transitionsag/seeds-bloom/styles.css",
    );
    assertEquals(cssResolved, join(pkgDir, "src", "styles.css"));
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});
