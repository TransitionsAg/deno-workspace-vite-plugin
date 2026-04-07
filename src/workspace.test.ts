import { assertEquals, assertNotEquals, assertStrictEquals } from "@std/assert";
import { join } from "@std/path";
import { expandMembers, findWorkspaceRoot } from "./workspace.ts";

Deno.test("findWorkspaceRoot returns null when no deno.json exists", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "workspace-test-" });
  try {
    const result = findWorkspaceRoot(tmp);
    assertStrictEquals(result, null);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("findWorkspaceRoot returns config without workspace field", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "workspace-test-" });
  try {
    await Deno.writeTextFile(
      join(tmp, "deno.json"),
      JSON.stringify({ name: "test-pkg" }),
    );
    const result = findWorkspaceRoot(tmp);
    assertNotEquals(result, null);
    assertEquals(result!.rootDir, tmp);
    assertEquals(result!.members, []);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("findWorkspaceRoot finds workspace with members", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "workspace-test-" });
  try {
    await Deno.writeTextFile(
      join(tmp, "deno.json"),
      JSON.stringify({
        workspace: ["./packages/*", "./apps/*"],
      }),
    );
    const result = findWorkspaceRoot(tmp);
    assertNotEquals(result, null);
    assertEquals(result!.rootDir, tmp);
    assertEquals(result!.members, ["./packages/*", "./apps/*"]);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("findWorkspaceRoot walks up directory tree", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "workspace-test-" });
  try {
    const nested = join(tmp, "nested", "deep");
    await Deno.mkdir(nested, { recursive: true });

    await Deno.writeTextFile(
      join(tmp, "deno.json"),
      JSON.stringify({
        workspace: ["./packages/*"],
      }),
    );

    const result = findWorkspaceRoot(nested);
    assertNotEquals(result, null);
    assertEquals(result!.rootDir, tmp);
    assertEquals(result!.members, ["./packages/*"]);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("findWorkspaceRoot prefers deno.jsonc when both exist", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "workspace-test-" });
  try {
    await Deno.writeTextFile(
      join(tmp, "deno.jsonc"),
      JSON.stringify({
        workspace: ["./packages/*"],
      }),
    );
    await Deno.writeTextFile(
      join(tmp, "deno.json"),
      JSON.stringify({ name: "other" }),
    );

    const result = findWorkspaceRoot(join(tmp, "sub"));
    assertNotEquals(result, null);
    assertEquals(result!.rootDir, tmp);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("findWorkspaceRoot handles JSONC with comments", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "workspace-test-" });
  try {
    await Deno.writeTextFile(
      join(tmp, "deno.jsonc"),
      `{
        // This is a comment
        "workspace": [
          "./packages/*" // inline comment
        ]
      }`,
    );
    const result = findWorkspaceRoot(tmp);
    assertNotEquals(result, null);
    assertEquals(result!.members, ["./packages/*"]);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("findWorkspaceRoot walks past member deno.json to root workspace", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "workspace-test-" });
  try {
    // Simulates: seeds/deno.json (workspace root) + seeds/apps/docs/deno.json (member)
    const memberDir = join(tmp, "apps", "docs");
    await Deno.mkdir(memberDir, { recursive: true });

    await Deno.writeTextFile(
      join(tmp, "deno.json"),
      JSON.stringify({ workspace: ["./packages/*", "./apps/*"] }),
    );
    await Deno.writeTextFile(
      join(memberDir, "deno.json"),
      JSON.stringify({ name: "@myapp/docs", imports: {} }),
    );

    // Starting from inside the member app should still find the root workspace
    const result = findWorkspaceRoot(memberDir);
    assertNotEquals(result, null);
    assertEquals(result!.rootDir, tmp);
    assertEquals(result!.members, ["./packages/*", "./apps/*"]);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("findWorkspaceRoot returns member config when no workspace root above", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "workspace-test-" });
  try {
    await Deno.writeTextFile(
      join(tmp, "deno.json"),
      JSON.stringify({ name: "standalone-pkg" }),
    );
    const result = findWorkspaceRoot(tmp);
    assertNotEquals(result, null);
    assertEquals(result!.rootDir, tmp);
    assertEquals(result!.members, []);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("expandMembers expands glob patterns to directories", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "workspace-test-" });
  try {
    await Deno.mkdir(join(tmp, "packages", "pkg-a"), { recursive: true });
    await Deno.mkdir(join(tmp, "packages", "pkg-b"), { recursive: true });
    await Deno.writeTextFile(join(tmp, "packages", "not-a-dir.txt"), "hello");

    const workspace = {
      rootDir: tmp,
      members: ["./packages/*"],
    };

    const result = await expandMembers(workspace);
    assertEquals(result.length, 2);
    const names = result.map((d) => d.split("/").pop());
    assertEquals(names.sort(), ["pkg-a", "pkg-b"]);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("expandMembers handles multiple glob patterns", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "workspace-test-" });
  try {
    await Deno.mkdir(join(tmp, "packages", "pkg-a"), { recursive: true });
    await Deno.mkdir(join(tmp, "apps", "app-a"), { recursive: true });

    const workspace = {
      rootDir: tmp,
      members: ["./packages/*", "./apps/*"],
    };

    const result = await expandMembers(workspace);
    assertEquals(result.length, 2);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("expandMembers returns empty array for no members", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "workspace-test-" });
  try {
    const workspace = {
      rootDir: tmp,
      members: [] as string[],
    };

    const result = await expandMembers(workspace);
    assertEquals(result, []);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});
