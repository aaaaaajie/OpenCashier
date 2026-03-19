import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ROOT_PACKAGE_PATH = path.join(ROOT, "package.json");
const PACKAGE_PATHS = [
  "apps/api/package.json",
  "apps/web/package.json",
  "examples/merchant-quickstart/package.json",
  "packages/sdk/package.json",
  "packages/shared/package.json",
  "packages/wechatpay-sdk/package.json"
].map((relativePath) => path.join(ROOT, relativePath));
const API_VERSION_PATH = path.join(ROOT, "apps/api/src/version.ts");
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function normalizeVersion(value) {
  if (!value) {
    return null;
  }

  return value.startsWith("v") ? value.slice(1) : value;
}

function assertVersion(value) {
  if (!SEMVER_PATTERN.test(value)) {
    fail(`Invalid release version "${value}". Expected SemVer without the leading "v".`);
  }
}

function readRootVersion() {
  const rootPackage = readJson(ROOT_PACKAGE_PATH);
  const version = rootPackage.version;

  if (typeof version !== "string" || version.length === 0) {
    fail("Root package.json must contain a non-empty version string.");
  }

  assertVersion(version);
  return version;
}

function renderApiVersionFile(version) {
  return `export const APP_VERSION = "${version}";\n`;
}

function updatePackageVersion(filePath, version) {
  const current = readJson(filePath);

  if (current.version === version) {
    return false;
  }

  current.version = version;
  writeJson(filePath, current);
  return true;
}

function updateApiVersionFile(version) {
  const nextContent = renderApiVersionFile(version);
  const currentContent = fs.existsSync(API_VERSION_PATH)
    ? fs.readFileSync(API_VERSION_PATH, "utf8")
    : null;

  if (currentContent === nextContent) {
    return false;
  }

  fs.writeFileSync(API_VERSION_PATH, nextContent);
  return true;
}

function runSync(versionArg) {
  const normalizedVersion = normalizeVersion(versionArg);
  const version = normalizedVersion ?? readRootVersion();

  assertVersion(version);

  if (normalizedVersion) {
    const rootPackage = readJson(ROOT_PACKAGE_PATH);
    rootPackage.version = version;
    writeJson(ROOT_PACKAGE_PATH, rootPackage);
  }

  let changed = false;
  for (const filePath of PACKAGE_PATHS) {
    changed = updatePackageVersion(filePath, version) || changed;
  }
  changed = updateApiVersionFile(version) || changed;

  console.log(
    changed
      ? `Synchronized release version to ${version}.`
      : `Release version ${version} is already synchronized.`
  );
}

function runCheck() {
  const rootVersion = readRootVersion();
  const mismatches = [];

  for (const filePath of PACKAGE_PATHS) {
    const currentVersion = readJson(filePath).version;

    if (currentVersion !== rootVersion) {
      mismatches.push(
        `${path.relative(ROOT, filePath)} has version ${currentVersion}, expected ${rootVersion}.`
      );
    }
  }

  const expectedApiVersionFile = renderApiVersionFile(rootVersion);
  const currentApiVersionFile = fs.existsSync(API_VERSION_PATH)
    ? fs.readFileSync(API_VERSION_PATH, "utf8")
    : null;

  if (currentApiVersionFile !== expectedApiVersionFile) {
    mismatches.push(
      `${path.relative(ROOT, API_VERSION_PATH)} is out of date. Run \`pnpm release:version:sync\`.`
    );
  }

  if (mismatches.length > 0) {
    fail(mismatches.join("\n"));
  }

  console.log(`Release version ${rootVersion} is in sync.`);
}

function main() {
  const [command, versionArg] = process.argv.slice(2).filter((arg) => arg !== "--");

  switch (command) {
    case "check":
      runCheck();
      return;
    case "sync":
      runSync(versionArg);
      return;
    default:
      fail("Usage: node scripts/version.mjs <check|sync> [version]");
  }
}

main();
