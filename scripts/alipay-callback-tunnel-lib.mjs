export const ALIPAY_NOTIFY_PATH = "/api/v1/notify/alipay";
export const DEFAULT_PORT = "3000";
export const DEFAULT_ENV_KEY = "ALIPAY_NOTIFY_URL";
export const SUPPORTED_TUNNEL_TOOLS = [
  "cloudflared",
  "localhostrun",
  "localtunnel"
];

export function parseArgs(argv) {
  const options = {
    port: DEFAULT_PORT,
    writeEnv: false,
    tool: "",
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    switch (value) {
      case "--":
        break;
      case "--port": {
        const port = argv[index + 1];

        if (!port) {
          throw new Error("--port requires a value.");
        }

        options.port = port;
        index += 1;
        break;
      }
      case "--write-env":
        options.writeEnv = true;
        break;
      case "--tool": {
        const tool = argv[index + 1];

        if (!tool) {
          throw new Error("--tool requires a value.");
        }

        if (!SUPPORTED_TUNNEL_TOOLS.includes(tool)) {
          throw new Error(
            `--tool must be one of: ${SUPPORTED_TUNNEL_TOOLS.join(", ")}.`
          );
        }

        options.tool = tool;
        index += 1;
        break;
      }
      case "-h":
      case "--help":
        options.help = true;
        break;
      default:
        throw new Error(`unknown option: ${value}`);
    }
  }

  return options;
}

export function selectTunnelTool({
  requestedTool,
  hasCloudflared,
  hasSsh,
  hasPnpm
}) {
  if (requestedTool) {
    return requestedTool;
  }

  if (hasCloudflared) {
    return "cloudflared";
  }

  if (hasSsh) {
    return "localhostrun";
  }

  if (hasPnpm) {
    return "localtunnel";
  }

  throw new Error(
    "No supported tunnel tool found. Install cloudflared, ssh, or pnpm."
  );
}

export function resolveTunnelCommand(tool, port) {
  if (tool === "cloudflared") {
    return {
      command: "cloudflared",
      args: ["tunnel", "--url", `http://127.0.0.1:${port}`, "--no-autoupdate"]
    };
  }

  if (tool === "localhostrun") {
    return {
      command: "ssh",
      args: [
        "-o",
        "StrictHostKeyChecking=no",
        "-o",
        "ServerAliveInterval=30",
        "-R",
        `80:localhost:${port}`,
        "nokey@localhost.run"
      ]
    };
  }

  return {
    command: "pnpm",
    args: ["dlx", "localtunnel", "--port", String(port)]
  };
}

export function extractPublicUrl(tool, output) {
  if (tool === "cloudflared") {
    return output.match(/https:\/\/[-a-z0-9]+\.trycloudflare\.com/i)?.[0] ?? "";
  }

  if (tool === "localhostrun") {
    const localhostRunMatch = output.match(
      /tunneled with tls termination.*?(https:\/\/[^\s]+)/i
    );

    if (localhostRunMatch?.[1]) {
      return localhostRunMatch[1];
    }

    return output.match(/https:\/\/[^\s]*localhost\.run[^\s]*/i)?.[0] ?? "";
  }

  const localTunnelMatch = output.match(/your url is:\s*(https:\/\/[^\s]+)/i);
  return localTunnelMatch?.[1] ?? "";
}

export function buildNotifyUrl(publicUrl) {
  return new URL(ALIPAY_NOTIFY_PATH, ensureTrailingSlash(publicUrl)).toString();
}

export function upsertEnvContent(content, key, value) {
  const lines = content ? content.split(/\r?\n/) : [];
  const nextLine = `${key}=${value}`;
  let found = false;
  const nextLines = lines
    .filter((line, index, allLines) => !(index === allLines.length - 1 && line === ""))
    .map((line) => {
      if (line.startsWith(`${key}=`)) {
        found = true;
        return nextLine;
      }

      return line;
    });

  if (!found) {
    nextLines.push(nextLine);
  }

  return `${nextLines.join("\n")}\n`;
}

function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}
