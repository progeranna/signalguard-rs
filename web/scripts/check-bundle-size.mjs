#!/usr/bin/env node

import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptDirectory, "..");
const budgetFields = ["maxInitialJsBytes", "maxLargestJsBytes", "maxTotalJsBytes"];

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function isObject(value) {
  return value !== null && !Array.isArray(value) && typeof value === "object";
}

function isJavaScriptPath(assetPath) {
  return /\.(?:c|m)?js$/i.test(assetPath);
}

function normalizeAssetPath(assetPath, label) {
  if (typeof assetPath !== "string" || assetPath.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }

  const normalized = path.posix.normalize(assetPath.replaceAll("\\", "/")).replace(/^\.\//, "");
  if (
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    path.posix.isAbsolute(normalized)
  ) {
    throw new Error(`${label} is not a valid emitted asset path: ${assetPath}`);
  }

  return normalized;
}

function parseArguments(argv) {
  const options = {
    dist: path.join(webRoot, "dist"),
    budget: path.join(webRoot, "bundle-size-budget.json"),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument !== "--dist" && argument !== "--budget") {
      throw new Error(`unknown argument: ${argument}`);
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`missing value for ${argument}`);
    }

    options[argument.slice(2)] = path.resolve(process.cwd(), value);
    index += 1;
  }

  return options;
}

function formatKiB(bytes) {
  return `${(bytes / 1024).toFixed(2)} KiB`;
}

async function requireDirectory(directoryPath, label) {
  let stats;
  try {
    stats = await lstat(directoryPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`${label} does not exist: ${directoryPath}`);
    }
    throw error;
  }

  if (!stats.isDirectory()) {
    throw new Error(`${label} is not a directory: ${directoryPath}`);
  }
}

async function readJson(jsonPath, label) {
  let contents;
  try {
    contents = await readFile(jsonPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`${label} does not exist: ${jsonPath}`);
    }
    throw error;
  }

  try {
    return JSON.parse(contents);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${jsonPath}: ${error.message}`);
  }
}

async function readBudget(budgetPath) {
  const budget = await readJson(budgetPath, "bundle budget");
  if (!isObject(budget)) {
    throw new Error(`bundle budget must be a JSON object: ${budgetPath}`);
  }

  for (const metric of budgetFields) {
    if (!Number.isSafeInteger(budget[metric]) || budget[metric] <= 0) {
      throw new Error(
        `bundle budget field ${metric} must be a positive safe integer byte value: ${budgetPath}`,
      );
    }
  }

  return budget;
}

async function readManifest(manifestPath) {
  const manifest = await readJson(manifestPath, "Vite manifest");
  if (!isObject(manifest)) {
    throw new Error(`Vite manifest must be a JSON object: ${manifestPath}`);
  }

  const keys = Object.keys(manifest).sort(compareText);
  if (keys.length === 0) {
    throw new Error(`Vite manifest has no records: ${manifestPath}`);
  }

  for (const key of keys) {
    const record = manifest[key];
    if (!isObject(record)) {
      throw new Error(`Vite manifest record ${key} must be an object: ${manifestPath}`);
    }
    if (typeof record.file !== "string" || record.file.length === 0) {
      throw new Error(`Vite manifest record ${key} has an invalid file: ${manifestPath}`);
    }
    if (record.isEntry !== undefined && typeof record.isEntry !== "boolean") {
      throw new Error(`Vite manifest record ${key} has an invalid isEntry: ${manifestPath}`);
    }
    record.file = normalizeAssetPath(record.file, `Vite manifest record ${key} file`);

    for (const edgeType of ["imports", "dynamicImports"]) {
      if (record[edgeType] === undefined) continue;
      if (
        !Array.isArray(record[edgeType]) ||
        record[edgeType].some((reference) => typeof reference !== "string" || reference.length === 0)
      ) {
        throw new Error(
          `Vite manifest record ${key} has invalid ${edgeType}: ${manifestPath}`,
        );
      }
      record[edgeType] = [...record[edgeType]].sort(compareText);
    }
  }

  for (const key of keys) {
    for (const edgeType of ["imports", "dynamicImports"]) {
      for (const reference of manifest[key][edgeType] ?? []) {
        if (!Object.hasOwn(manifest, reference)) {
          throw new Error(
            `Vite manifest record ${key} ${edgeType} references missing record ${reference}: ${manifestPath}`,
          );
        }
      }
    }
  }

  return { manifest, keys };
}

async function collectJavaScriptAssets(assetsDirectory) {
  const assets = [];
  const distDirectory = path.dirname(assetsDirectory);

  async function visit(directoryPath) {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    entries.sort((left, right) => compareText(left.name, right.name));

    for (const entry of entries) {
      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
        continue;
      }
      if (!entry.isFile() || !isJavaScriptPath(entry.name)) continue;

      const stats = await lstat(entryPath);
      const assetPath = normalizeAssetPath(
        path.relative(distDirectory, entryPath).split(path.sep).join("/"),
        "emitted JavaScript asset path",
      );
      if (stats.size === 0) {
        throw new Error(`JavaScript asset is empty: ${assetPath}`);
      }
      assets.push({ path: assetPath, bytes: stats.size });
    }
  }

  await visit(assetsDirectory);
  assets.sort((left, right) => compareText(left.path, right.path));
  return assets;
}

function collectInitialAssetPaths(manifest, keys, assetByPath, manifestPath) {
  const entryKeys = keys.filter(
    (key) => manifest[key].isEntry === true && isJavaScriptPath(manifest[key].file),
  );
  if (entryKeys.length === 0) {
    throw new Error(`Vite manifest has no JavaScript entry records: ${manifestPath}`);
  }

  for (const key of keys) {
    const assetPath = manifest[key].file;
    if (isJavaScriptPath(assetPath) && !assetByPath.has(assetPath)) {
      throw new Error(`Vite manifest record ${key} references missing emitted file: ${assetPath}`);
    }
  }

  const initialPaths = new Set();
  const state = new Map();

  function visit(key, ancestry) {
    if (state.get(key) === "visited") return;
    if (state.get(key) === "visiting") {
      throw new Error(`Vite manifest static import cycle: ${[...ancestry, key].join(" -> ")}`);
    }

    state.set(key, "visiting");
    const record = manifest[key];
    if (!isJavaScriptPath(record.file)) {
      throw new Error(`Vite manifest static closure record ${key} is not JavaScript: ${record.file}`);
    }
    initialPaths.add(record.file);

    for (const reference of record.imports ?? []) {
      visit(reference, [...ancestry, key]);
    }
    state.set(key, "visited");
  }

  for (const entryKey of entryKeys) visit(entryKey, []);
  return new Set([...initialPaths].sort(compareText));
}

function printMetric(label, actual, limit) {
  console.log(
    `- ${label}: actual ${actual} bytes (${formatKiB(actual)}); limit ${limit} bytes (${formatKiB(limit)}); headroom ${limit - actual} bytes`,
  );
}

function printReport({ assets, initialPaths, budget, manifestPath }) {
  const largestAsset = assets.reduce((largest, asset) =>
    asset.bytes > largest.bytes ? asset : largest,
  );
  const initialBytes = assets.reduce(
    (total, asset) => total + (initialPaths.has(asset.path) ? asset.bytes : 0),
    0,
  );
  const totalBytes = assets.reduce((total, asset) => total + asset.bytes, 0);

  console.log("Bundle size report");
  console.log(`- manifest: ${manifestPath}`);
  console.log(`- all-JS asset count: ${assets.length}`);
  console.log(`- initial-closure asset count: ${initialPaths.size}`);
  for (const asset of assets) {
    const classification = initialPaths.has(asset.path) ? "initial" : "async/non-initial";
    console.log(`- asset: ${asset.path}; bytes: ${asset.bytes}; classification: ${classification}`);
  }
  printMetric("initial JS", initialBytes, budget.maxInitialJsBytes);
  console.log(`- largest JS asset: ${largestAsset.path}`);
  printMetric("largest JS", largestAsset.bytes, budget.maxLargestJsBytes);
  printMetric("total JS", totalBytes, budget.maxTotalJsBytes);

  const failures = [
    {
      metric: "initial JS",
      actual: initialBytes,
      allowed: budget.maxInitialJsBytes,
    },
    {
      metric: "largest JS asset",
      asset: largestAsset.path,
      actual: largestAsset.bytes,
      allowed: budget.maxLargestJsBytes,
    },
    {
      metric: "total JS",
      actual: totalBytes,
      allowed: budget.maxTotalJsBytes,
    },
  ].filter((failure) => failure.actual > failure.allowed);

  if (failures.length === 0) {
    console.log("Bundle budget: PASS");
    return;
  }

  console.error("Bundle budget: FAIL");
  for (const failure of failures) {
    console.error(`- failed metric: ${failure.metric}`);
    if (failure.asset) console.error(`  asset: ${failure.asset}`);
    console.error(`  actual bytes: ${failure.actual}`);
    console.error(`  allowed bytes: ${failure.allowed}`);
    console.error(`  excess bytes: ${failure.actual - failure.allowed}`);
  }
  process.exitCode = 1;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const assetsDirectory = path.join(options.dist, "assets");
  const manifestPath = path.join(options.dist, ".vite", "manifest.json");

  await requireDirectory(options.dist, "build output directory");
  await requireDirectory(assetsDirectory, "build assets directory");

  const budget = await readBudget(options.budget);
  const { manifest, keys } = await readManifest(manifestPath);
  const assets = await collectJavaScriptAssets(assetsDirectory);
  if (assets.length === 0) {
    throw new Error(`no JavaScript assets found under: ${assetsDirectory}`);
  }

  const assetByPath = new Map(assets.map((asset) => [asset.path, asset]));
  const initialPaths = collectInitialAssetPaths(manifest, keys, assetByPath, manifestPath);
  printReport({ assets, initialPaths, budget, manifestPath });
}

main().catch((error) => {
  console.error(`Bundle budget: ERROR — ${error.message}`);
  process.exitCode = 1;
});
