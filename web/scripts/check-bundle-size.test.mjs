import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const checkerPath = import.meta.url.startsWith("file:")
  ? path.join(path.dirname(fileURLToPath(import.meta.url)), "check-bundle-size.mjs")
  : path.resolve(process.cwd(), "scripts/check-bundle-size.mjs");
const passingBudget = {
  maxInitialJsBytes: 1_000,
  maxLargestJsBytes: 1_000,
  maxTotalJsBytes: 1_000,
};

async function createFixture(
  t,
  {
    assets = { "assets/main.js": 10 },
    manifest = { entry: { file: "assets/main.js", isEntry: true } },
    budget = passingBudget,
    manifestContents,
    budgetContents,
    writeManifest = true,
  } = {},
) {
  const root = await mkdtemp(path.join(os.tmpdir(), "signalguard-bundle-policy-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dist = path.join(root, "dist");
  const budgetPath = path.join(root, "budget.json");
  await mkdir(path.join(dist, "assets"), { recursive: true });

  for (const [assetPath, bytes] of Object.entries(assets)) {
    const fullPath = path.join(dist, assetPath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, "x".repeat(bytes));
  }

  if (writeManifest) {
    await mkdir(path.join(dist, ".vite"), { recursive: true });
    await writeFile(
      path.join(dist, ".vite", "manifest.json"),
      manifestContents ?? JSON.stringify(manifest),
    );
  }
  await writeFile(budgetPath, budgetContents ?? JSON.stringify(budget));
  return { dist, budgetPath };
}

async function runChecker(fixture) {
  try {
    const result = await execFileAsync(process.execPath, [
      checkerPath,
      "--dist",
      fixture.dist,
      "--budget",
      fixture.budgetPath,
    ]);
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      code: error.code,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
    };
  }
}

test("passes a single-entry single-chunk build", async (t) => {
  const result = await runChecker(await createFixture(t));
  assert.equal(result.code, 0);
  assert.match(result.stdout, /all-JS asset count: 1/);
  assert.match(result.stdout, /initial-closure asset count: 1/);
  assert.match(result.stdout, /initial JS: actual 10 bytes/);
  assert.match(result.stdout, /Bundle budget: PASS/);
});

test("counts recursively reachable static imports as initial and total", async (t) => {
  const fixture = await createFixture(t, {
    assets: {
      "assets/entry.js": 10,
      "assets/middle.js": 20,
      "assets/leaf.js": 30,
    },
    manifest: {
      entry: { file: "assets/entry.js", isEntry: true, imports: ["middle"] },
      middle: { file: "assets/middle.js", imports: ["leaf"] },
      leaf: { file: "assets/leaf.js" },
    },
  });
  const result = await runChecker(fixture);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /initial-closure asset count: 3/);
  assert.match(result.stdout, /initial JS: actual 60 bytes/);
  assert.match(result.stdout, /total JS: actual 60 bytes/);
});

test("excludes dynamic imports from initial and includes them in total", async (t) => {
  const fixture = await createFixture(t, {
    assets: { "assets/entry.js": 10, "assets/lazy.js": 25 },
    manifest: {
      entry: { file: "assets/entry.js", isEntry: true, dynamicImports: ["lazy"] },
      lazy: { file: "assets/lazy.js" },
    },
  });
  const result = await runChecker(fixture);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /assets\/lazy\.js; bytes: 25; classification: async\/non-initial/);
  assert.match(result.stdout, /initial JS: actual 10 bytes/);
  assert.match(result.stdout, /total JS: actual 35 bytes/);
});

test("includes a dynamic target when it is also statically reachable", async (t) => {
  const fixture = await createFixture(t, {
    assets: { "assets/entry.js": 10, "assets/shared.js": 25 },
    manifest: {
      entry: {
        file: "assets/entry.js",
        isEntry: true,
        imports: ["shared"],
        dynamicImports: ["shared"],
      },
      shared: { file: "assets/shared.js" },
    },
  });
  const result = await runChecker(fixture);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /assets\/shared\.js; bytes: 25; classification: initial/);
  assert.match(result.stdout, /initial JS: actual 35 bytes/);
});

test("includes unreferenced JavaScript assets only in total", async (t) => {
  const fixture = await createFixture(t, {
    assets: { "assets/main.js": 10, "assets/orphan.js": 40 },
  });
  const result = await runChecker(fixture);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /assets\/orphan\.js; bytes: 40; classification: async\/non-initial/);
  assert.match(result.stdout, /initial JS: actual 10 bytes/);
  assert.match(result.stdout, /total JS: actual 50 bytes/);
});

test("deduplicates repeated manifest references", async (t) => {
  const fixture = await createFixture(t, {
    assets: { "assets/entry.js": 10, "assets/shared.js": 20 },
    manifest: {
      entry: { file: "assets/entry.js", isEntry: true, imports: ["shared", "shared"] },
      shared: { file: "assets/shared.js" },
    },
  });
  const result = await runChecker(fixture);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /initial-closure asset count: 2/);
  assert.match(result.stdout, /initial JS: actual 30 bytes/);
});

test("deduplicates normalized emitted asset paths", async (t) => {
  const fixture = await createFixture(t, {
    assets: { "assets/entry.js": 10, "assets/shared.js": 20 },
    manifest: {
      entry: { file: "assets/entry.js", isEntry: true, imports: ["first", "second"] },
      first: { file: "assets/./shared.js" },
      second: { file: "assets/shared.js" },
    },
  });
  const result = await runChecker(fixture);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /initial-closure asset count: 2/);
  assert.match(result.stdout, /initial JS: actual 30 bytes/);
});

test("unions static closures from multiple entries", async (t) => {
  const fixture = await createFixture(t, {
    assets: {
      "assets/a.js": 10,
      "assets/b.js": 20,
      "assets/shared.js": 30,
    },
    manifest: {
      a: { file: "assets/a.js", isEntry: true, imports: ["shared"] },
      b: { file: "assets/b.js", isEntry: true, imports: ["shared"] },
      shared: { file: "assets/shared.js" },
    },
  });
  const result = await runChecker(fixture);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /initial-closure asset count: 3/);
  assert.match(result.stdout, /initial JS: actual 60 bytes/);
});

test("prints assets in deterministic lexical order", async (t) => {
  const fixture = await createFixture(t, {
    assets: {
      "assets/z.js": 10,
      "assets/nested/b.js": 10,
      "assets/a.js": 10,
    },
    manifest: { entry: { file: "assets/z.js", isEntry: true } },
  });
  const first = await runChecker(fixture);
  const second = await runChecker(fixture);
  assert.equal(first.code, 0);
  assert.equal(first.stdout, second.stdout);
  const assetLines = first.stdout.split("\n").filter((line) => line.startsWith("- asset:"));
  assert.deepEqual(assetLines, [
    "- asset: assets/a.js; bytes: 10; classification: async/non-initial",
    "- asset: assets/nested/b.js; bytes: 10; classification: async/non-initial",
    "- asset: assets/z.js; bytes: 10; classification: initial",
  ]);
});

test("reports an independent initial budget failure", async (t) => {
  const fixture = await createFixture(t, {
    assets: { "assets/entry.js": 40, "assets/shared.js": 30 },
    manifest: {
      entry: { file: "assets/entry.js", isEntry: true, imports: ["shared"] },
      shared: { file: "assets/shared.js" },
    },
    budget: { maxInitialJsBytes: 60, maxLargestJsBytes: 100, maxTotalJsBytes: 100 },
  });
  const result = await runChecker(fixture);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /failed metric: initial JS/);
  assert.doesNotMatch(result.stderr, /failed metric: largest JS asset/);
  assert.doesNotMatch(result.stderr, /failed metric: total JS/);
});

test("reports an independent largest-asset budget failure", async (t) => {
  const fixture = await createFixture(t, {
    assets: { "assets/main.js": 70 },
    budget: { maxInitialJsBytes: 100, maxLargestJsBytes: 60, maxTotalJsBytes: 100 },
  });
  const result = await runChecker(fixture);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /failed metric: largest JS asset[\s\S]*asset: assets\/main\.js/);
  assert.doesNotMatch(result.stderr, /failed metric: initial JS/);
  assert.doesNotMatch(result.stderr, /failed metric: total JS/);
});

test("reports an independent total budget failure", async (t) => {
  const fixture = await createFixture(t, {
    assets: { "assets/main.js": 40, "assets/orphan.js": 30 },
    budget: { maxInitialJsBytes: 100, maxLargestJsBytes: 100, maxTotalJsBytes: 60 },
  });
  const result = await runChecker(fixture);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /failed metric: total JS/);
  assert.doesNotMatch(result.stderr, /failed metric: initial JS/);
  assert.doesNotMatch(result.stderr, /failed metric: largest JS asset/);
});

test("reports simultaneous budget failures in metric order", async (t) => {
  const fixture = await createFixture(t, {
    assets: { "assets/main.js": 70 },
    budget: { maxInitialJsBytes: 60, maxLargestJsBytes: 60, maxTotalJsBytes: 60 },
  });
  const result = await runChecker(fixture);
  assert.equal(result.code, 1);
  const metrics = [...result.stderr.matchAll(/failed metric: ([^\n]+)/g)].map((match) => match[1]);
  assert.deepEqual(metrics, ["initial JS", "largest JS asset", "total JS"]);
  assert.equal((result.stderr.match(/excess bytes: 10/g) ?? []).length, 3);
});

test("fails when the manifest is missing", async (t) => {
  const result = await runChecker(await createFixture(t, { writeManifest: false }));
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Vite manifest does not exist/);
});

test("fails on malformed manifest JSON", async (t) => {
  const result = await runChecker(
    await createFixture(t, { manifestContents: "{ definitely not JSON" }),
  );
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Vite manifest is not valid JSON/);
});

test("fails on a malformed manifest record", async (t) => {
  const result = await runChecker(await createFixture(t, { manifest: { entry: [] } }));
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Vite manifest record entry must be an object/);
});

test("fails on missing referenced manifest records", async (t) => {
  const result = await runChecker(
    await createFixture(t, {
      manifest: {
        entry: { file: "assets/main.js", isEntry: true, imports: ["missing"] },
      },
    }),
  );
  assert.equal(result.code, 1);
  assert.match(result.stderr, /imports references missing record missing/);
});

test("fails on missing emitted files", async (t) => {
  const result = await runChecker(
    await createFixture(t, {
      manifest: {
        entry: { file: "assets/main.js", isEntry: true, dynamicImports: ["lazy"] },
        lazy: { file: "assets/lazy.js" },
      },
    }),
  );
  assert.equal(result.code, 1);
  assert.match(result.stderr, /record lazy references missing emitted file: assets\/lazy\.js/);
});

test("fails on malformed budget JSON", async (t) => {
  const result = await runChecker(await createFixture(t, { budgetContents: "[" }));
  assert.equal(result.code, 1);
  assert.match(result.stderr, /bundle budget is not valid JSON/);
});

test("fails when the budget is not an object", async (t) => {
  const result = await runChecker(await createFixture(t, { budgetContents: "[]" }));
  assert.equal(result.code, 1);
  assert.match(result.stderr, /bundle budget must be a JSON object/);
});

test("rejects every invalid budget metric field", async (t) => {
  for (const metric of Object.keys(passingBudget)) {
    for (const invalidValue of [0, -1, 1.5, "100", Number.MAX_SAFE_INTEGER + 1, null]) {
      const result = await runChecker(
        await createFixture(t, { budget: { ...passingBudget, [metric]: invalidValue } }),
      );
      assert.equal(result.code, 1);
      assert.match(result.stderr, new RegExp(`field ${metric} must be a positive safe integer`));
    }

    const missingMetricBudget = { ...passingBudget };
    delete missingMetricBudget[metric];
    const missingResult = await runChecker(
      await createFixture(t, { budget: missingMetricBudget }),
    );
    assert.equal(missingResult.code, 1);
    assert.match(
      missingResult.stderr,
      new RegExp(`field ${metric} must be a positive safe integer`),
    );
  }
});

test("fails when no JavaScript assets are emitted", async (t) => {
  const result = await runChecker(await createFixture(t, { assets: {} }));
  assert.equal(result.code, 1);
  assert.match(result.stderr, /no JavaScript assets found under/);
});

test("fails when an emitted JavaScript asset is empty", async (t) => {
  const result = await runChecker(await createFixture(t, { assets: { "assets/main.js": 0 } }));
  assert.equal(result.code, 1);
  assert.match(result.stderr, /JavaScript asset is empty: assets\/main\.js/);
});

test("accepts .js, .mjs, and .cjs assets", async (t) => {
  const fixture = await createFixture(t, {
    assets: {
      "assets/entry.mjs": 10,
      "assets/static.cjs": 20,
      "assets/unreferenced.js": 30,
      "assets/ignored.json": 40,
    },
    manifest: {
      entry: { file: "assets/entry.mjs", isEntry: true, imports: ["static"] },
      static: { file: "assets/static.cjs" },
    },
  });
  const result = await runChecker(fixture);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /all-JS asset count: 3/);
  assert.match(result.stdout, /initial-closure asset count: 2/);
  assert.match(result.stdout, /initial JS: actual 30 bytes/);
  assert.match(result.stdout, /total JS: actual 60 bytes/);
  assert.doesNotMatch(result.stdout, /ignored\.json/);
});

test("fails clearly on a static import cycle", async (t) => {
  const fixture = await createFixture(t, {
    assets: { "assets/a.js": 10, "assets/b.js": 10 },
    manifest: {
      a: { file: "assets/a.js", isEntry: true, imports: ["b"] },
      b: { file: "assets/b.js", imports: ["a"] },
    },
  });
  const result = await runChecker(fixture);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Vite manifest static import cycle: a -> b -> a/);
});
