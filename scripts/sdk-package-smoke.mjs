import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const SDK_DIR = path.join(ROOT, "packages/sdk");

function run(command, args, options = {}) {
  execFileSync(command, args, {
    stdio: "inherit",
    ...options
  });
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function findTarball(directory) {
  const tarball = fs
    .readdirSync(directory)
    .find((file) => file.startsWith("opencashier-sdk-") && file.endsWith(".tgz"));

  if (!tarball) {
    throw new Error(`Could not find packed SDK tarball in ${directory}.`);
  }

  return path.join(directory, tarball);
}

function main() {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "opencashier-sdk-smoke-")
  );
  const artifactsDir = path.join(tempRoot, "artifacts");
  const consumerDir = path.join(tempRoot, "consumer");

  fs.mkdirSync(artifactsDir, { recursive: true });
  fs.mkdirSync(consumerDir, { recursive: true });

  run("npm", ["pack", "--pack-destination", artifactsDir], { cwd: SDK_DIR });

  const tarballPath = findTarball(artifactsDir);

  run("npm", ["init", "-y"], { cwd: consumerDir, stdio: "ignore" });
  run("npm", ["install", tarballPath, "typescript", "@types/node"], {
    cwd: consumerDir
  });

  writeFile(
    path.join(consumerDir, "index.ts"),
    [
      'import { OpenCashierClient, createOpenCashierSigner } from "@opencashier/sdk";',
      "",
      'const signer = createOpenCashierSigner({ appId: "demo_app", appSecret: "demo_secret" });',
      'const client = new OpenCashierClient({',
      '  baseUrl: "http://127.0.0.1:3000/api/v1",',
      '  merchant: {',
      '    appId: "demo_app",',
      '    appSecret: "demo_secret"',
      "  }",
      "});",
      "",
      'console.log(typeof signer.buildHeaders, typeof client.orders.create);'
    ].join("\n")
  );

  writeFile(
    path.join(consumerDir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2020",
          module: "CommonJS",
          moduleResolution: "Node",
          strict: true,
          esModuleInterop: false,
          skipLibCheck: true
        },
        include: ["index.ts"]
      },
      null,
      2
    ) + "\n"
  );

  run(path.join(consumerDir, "node_modules/.bin/tsc"), ["-p", "tsconfig.json"], {
    cwd: consumerDir
  });
  run("node", ["index.js"], { cwd: consumerDir });

  console.log(`SDK package smoke test passed via ${tarballPath}.`);
}

main();
