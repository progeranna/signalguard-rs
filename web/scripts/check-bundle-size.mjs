#!/usr/bin/env node

import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptDirectory, "..");

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
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

async function readBudget(budgetPath) {
  let rawBudget;
  try {
    rawBudget = await readFile(budgetPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`bundle budget does not exist: ${budgetPath}`);
    }
    throw error;
  }

  let budget;
  try {
    budget = JSON.parse(rawBudget);
  } catch (error) {
    throw new Error(`bundle budget is not valid JSON: ${budgetPath}: ${error.message}`);
  }

  if (budget === null || Array.isArray(budget) || typeof budget !== "object") {
    throw new Error(`bundle budget must be a JSON object: ${budgetPath}`);
  }

  for (const metric of ["maxLargestJsBytes", "maxTotalJsBytes"]) {
    if (!Number.isSafeInteger(budget[metric]) || budget[metric] <= 0) {
      throw new Error(
        `bundle budget field ${metric} must be a positive integer byte value: ${budgetPath}`,
      );
    }
  }

  return budget;
}

async function collectJavaScriptAssets(assetsDirectory) {
  const assets = [];

  async function visit(directoryPath) {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    entries.sort((left, right) => compareText(left.name, right.name));

    for (const entry of entries) {
      const entryPath = path.join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        await visit(entryPath);
        continue;
      }

      if (!entry.isFile() || !/\.(?:c|m)?js$/i.test(entry.name)) {
        continue;
      }

      const stats = await lstat(entryPath);
      assets.push({
        path: path.relative(path.dirname(assetsDirectory), entryPath).split(path.sep).join("/"),
        bytes: stats.size,
      });
    }
  }

  await visit(assetsDirectory);
  assets.sort((left, right) => compareText(left.path, right.path));
  return assets;
}

function printReport(assets, budget) {
  const largestAsset = assets.reduce((largest, asset) =>
    asset.bytes > largest.bytes ? asset : largest,
  );
  const totalBytes = assets.reduce((total, asset) => total + asset.bytes, 0);

  console.log("Bundle size report");
  console.log(`- assets: ${assets.length}`);
  for (const asset of assets) {
    console.log(`- ${asset.path}: ${asset.bytes} bytes (${formatKiB(asset.bytes)})`);
  }
  console.log(
    `- largest JS: ${largestAsset.path} — ${largestAsset.bytes} bytes (${formatKiB(largestAsset.bytes)}) / budget ${budget.maxLargestJsBytes} bytes (${formatKiB(budget.maxLargestJsBytes)})`,
  );
  console.log(
    `- total JS: ${totalBytes} bytes (${formatKiB(totalBytes)}) / budget ${budget.maxTotalJsBytes} bytes (${formatKiB(budget.maxTotalJsBytes)})`,
  );

  const failures = [];
  if (largestAsset.bytes > budget.maxLargestJsBytes) {
    failures.push({
      metric: "largest JS asset",
      asset: largestAsset.path,
      actual: largestAsset.bytes,
      allowed: budget.maxLargestJsBytes,
    });
  }
  if (totalBytes > budget.maxTotalJsBytes) {
    failures.push({
      metric: "total JS size",
      actual: totalBytes,
      allowed: budget.maxTotalJsBytes,
    });
  }

  if (failures.length === 0) {
    console.log("Bundle budget: PASS");
    return;
  }

  console.error("Bundle budget: FAIL");
  for (const failure of failures) {
    console.error(`- failed metric: ${failure.metric}`);
    if (failure.asset) {
      console.error(`  asset: ${failure.asset}`);
    }
    console.error(`  actual bytes: ${failure.actual}`);
    console.error(`  allowed bytes: ${failure.allowed}`);
    console.error(`  excess bytes: ${failure.actual - failure.allowed}`);
  }
  process.exitCode = 1;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const assetsDirectory = path.join(options.dist, "assets");

  await requireDirectory(options.dist, "build output directory");
  await requireDirectory(assetsDirectory, "build assets directory");

  const [budget, assets] = await Promise.all([
    readBudget(options.budget),
    collectJavaScriptAssets(assetsDirectory),
  ]);

  if (assets.length === 0) {
    throw new Error(`no JavaScript assets found under: ${assetsDirectory}`);
  }

  printReport(assets, budget);
}

main().catch((error) => {
  console.error(`Bundle budget: ERROR — ${error.message}`);
  process.exitCode = 1;
});
