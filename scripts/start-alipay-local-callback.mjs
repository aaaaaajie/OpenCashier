#!/usr/bin/env node

import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_ENV_KEY,
  DEFAULT_PORT,
  buildNotifyUrl,
  extractPublicUrl,
  parseArgs,
  resolveTunnelCommand,
  selectTunnelTool,
  upsertEnvContent
} from "./alipay-callback-tunnel-lib.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, "..");
const ENV_FILE = join(ROOT_DIR, ".env");
const HELP_TEXT = `Usage:
  ./scripts/start-alipay-local-callback.sh [--port 3000] [--write-env] [--tool cloudflared|localhostrun|localtunnel]

Options:
  --port <port>      Local API port (default: ${DEFAULT_PORT})
  --write-env        Upsert ${DEFAULT_ENV_KEY} into .env
  --tool <name>      Force tunnel tool. Default auto-detect: cloudflared -> localhostrun -> localtunnel
  -h, --help         Show help

Examples:
  pnpm tunnel:alipay
  pnpm tunnel:alipay -- --write-env
  ./scripts/start-alipay-local-callback.sh --port 3000 --tool localhostrun
`;

async function main() {
  let options;

  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    printError(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  if (options.help) {
    process.stdout.write(HELP_TEXT);
    return;
  }

  const port = options.port || DEFAULT_PORT;
  const isListening = await isPortListening(port);

  if (!isListening) {
    printError(
      `no process is listening on 127.0.0.1:${port}.\n\nStart API first, for example:\n  pnpm dev:api`
    );
    process.exitCode = 1;
    return;
  }

  let tool;

  try {
    tool = selectTunnelTool({
      requestedTool: options.tool,
      hasCloudflared: commandExists("cloudflared"),
      hasSsh: commandExists("ssh"),
      hasPnpm: commandExists("pnpm")
    });
  } catch (error) {
    printError(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  if (!isToolAvailable(tool)) {
    process.exitCode = 1;
    return;
  }

  const { command, args } = resolveTunnelCommand(tool, port);
  const logDir = mkdtempSync(join(tmpdir(), "alipay-tunnel-"));
  const logFile = join(logDir, `${tool}.log`);
  const child = spawn(command, args, {
    cwd: ROOT_DIR,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";

  const recordOutput = (chunk) => {
    const text = String(chunk);
    output += text;
    appendFileSync(logFile, text);
  };

  child.stdout.on("data", recordOutput);
  child.stderr.on("data", recordOutput);

  const cleanup = () => {
    if (!child.killed && child.exitCode === null) {
      child.kill("SIGTERM");
    }

    rmSync(logDir, { recursive: true, force: true });
  };

  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });

  const publicUrl = await waitForPublicUrl(tool, child, () => output, 45);

  if (!publicUrl) {
    cleanup();
    printError(`failed to obtain public URL from ${tool}.\n\nTunnel logs:\n${output.trim()}`);
    process.exitCode = 1;
    return;
  }

  const notifyUrl = buildNotifyUrl(publicUrl);

  if (options.writeEnv) {
    const currentContent = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
    const nextContent = upsertEnvContent(currentContent, DEFAULT_ENV_KEY, notifyUrl);
    writeFileSync(ENV_FILE, nextContent);
  }

  process.stdout.write(`Local Alipay callback tunnel is ready.

Tool: ${tool}
Public URL: ${publicUrl}
Notify URL: ${notifyUrl}

Use this in your local env:
  ${DEFAULT_ENV_KEY}=${notifyUrl}
`);

  if (options.writeEnv) {
    process.stdout.write(`\nUpdated: ${ENV_FILE}\nRestart API to load the new ${DEFAULT_ENV_KEY}.\n`);
  }

  const httpCode = await checkConnectivity(notifyUrl);
  process.stdout.write(`\nConnectivity check: ${formatConnectivityStatus(httpCode)}\n`);
  process.stdout.write("\nTunnel is running. Press Ctrl+C to stop.\n");

  child.on("exit", (code, signal) => {
    rmSync(logDir, { recursive: true, force: true });

    if (signal) {
      process.stdout.write(`\nTunnel stopped by signal: ${signal}\n`);
      return;
    }

    process.stdout.write(`\nTunnel exited with code: ${code ?? 0}\n`);
  });
}

function commandExists(command) {
  const whichCommand = process.platform === "win32" ? "where" : "which";
  return spawnSync(whichCommand, [command], { stdio: "ignore" }).status === 0;
}

function isToolAvailable(tool) {
  if (tool === "cloudflared" && !commandExists("cloudflared")) {
    printError("cloudflared is not installed.\n\nInstall:\n  brew install cloudflared");
    return false;
  }

  if (tool === "localhostrun" && !commandExists("ssh")) {
    printError("ssh is required for localhost.run tunnel mode.");
    return false;
  }

  if (tool === "localtunnel" && !commandExists("pnpm")) {
    printError("pnpm is required for localtunnel mode.");
    return false;
  }

  return true;
}

function waitForPublicUrl(tool, child, getOutput, timeoutSeconds) {
  return new Promise((resolvePromise) => {
    let elapsed = 0;
    const timer = setInterval(() => {
      const publicUrl = extractPublicUrl(tool, getOutput());

      if (publicUrl) {
        clearInterval(timer);
        resolvePromise(publicUrl);
        return;
      }

      if (child.exitCode !== null || elapsed >= timeoutSeconds) {
        clearInterval(timer);
        resolvePromise("");
        return;
      }

      elapsed += 1;
    }, 1000);
  });
}

function isPortListening(port) {
  return new Promise((resolvePromise) => {
    const socket = net.createConnection({
      host: "127.0.0.1",
      port: Number.parseInt(String(port), 10)
    });

    socket.setTimeout(1000);

    socket.on("connect", () => {
      socket.destroy();
      resolvePromise(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolvePromise(false);
    });
    socket.on("error", () => {
      resolvePromise(false);
    });
  });
}

async function checkConnectivity(notifyUrl) {
  try {
    const response = await fetch(notifyUrl, {
      method: "GET",
      redirect: "manual"
    });

    return response.status;
  } catch {
    return 0;
  }
}

function formatConnectivityStatus(httpCode) {
  if ([400, 401, 404, 405].includes(httpCode)) {
    return `OK (HTTP ${httpCode})`;
  }

  if (httpCode === 0) {
    return "unable to reach the callback URL yet";
  }

  return `got HTTP ${httpCode} (still may work, verify API is running)`;
}

function printError(message) {
  process.stderr.write(`Error: ${message}\n`);
}

void main();
