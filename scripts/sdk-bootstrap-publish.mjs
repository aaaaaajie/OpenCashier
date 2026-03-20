import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SDK_DIR = path.join(ROOT, "packages/sdk");
const SDK_PACKAGE_PATH = path.join(SDK_DIR, "package.json");

function run(command, args, options = {}) {
  execFileSync(command, args, {
    stdio: "inherit",
    ...options
  });
}

function readSdkPackage() {
  return JSON.parse(fs.readFileSync(SDK_PACKAGE_PATH, "utf8"));
}

function resolveTag(version) {
  return version.includes("-") ? "next" : "latest";
}

function main() {
  const dryRun = process.argv.includes("--dry-run");
  const sdkPackage = readSdkPackage();
  const tag = resolveTag(sdkPackage.version);

  console.log(
    `Publishing ${sdkPackage.name}@${sdkPackage.version} from packages/sdk with npm dist-tag "${tag}"${dryRun ? " (dry-run)" : ""}.`
  );

  run("npm", [
    "publish",
    ...(dryRun ? ["--dry-run"] : []),
    "--access",
    "public",
    "--tag",
    tag
  ], {
    cwd: SDK_DIR
  });
}

main();
