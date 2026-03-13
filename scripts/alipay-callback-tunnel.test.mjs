import test from "node:test";
import assert from "node:assert/strict";
import {
  ALIPAY_NOTIFY_PATH,
  buildNotifyUrl,
  extractPublicUrl,
  parseArgs,
  resolveTunnelCommand,
  selectTunnelTool,
  upsertEnvContent
} from "./alipay-callback-tunnel-lib.mjs";

test("parseArgs reads explicit options", () => {
  const options = parseArgs(["--port", "3010", "--write-env", "--tool", "cloudflared"]);

  assert.deepEqual(options, {
    port: "3010",
    writeEnv: true,
    tool: "cloudflared",
    help: false
  });
});

test("parseArgs tolerates pnpm argument separator", () => {
  const options = parseArgs(["--", "--help"]);

  assert.equal(options.help, true);
});

test("parseArgs rejects unknown options", () => {
  assert.throws(() => parseArgs(["--unknown"]), /unknown option/);
});

test("selectTunnelTool prefers requested tool and falls back by availability", () => {
  assert.equal(
    selectTunnelTool({
      requestedTool: "localtunnel",
      hasCloudflared: true,
      hasSsh: true,
      hasPnpm: true
    }),
    "localtunnel"
  );
  assert.equal(
    selectTunnelTool({
      requestedTool: "",
      hasCloudflared: false,
      hasSsh: true,
      hasPnpm: true
    }),
    "localhostrun"
  );
});

test("resolveTunnelCommand returns the right command line", () => {
  assert.deepEqual(resolveTunnelCommand("cloudflared", "3000"), {
    command: "cloudflared",
    args: ["tunnel", "--url", "http://127.0.0.1:3000", "--no-autoupdate"]
  });
  assert.deepEqual(resolveTunnelCommand("localtunnel", "3000"), {
    command: "pnpm",
    args: ["dlx", "localtunnel", "--port", "3000"]
  });
});

test("extractPublicUrl parses supported tunnel outputs", () => {
  assert.equal(
    extractPublicUrl("cloudflared", "INF https://demo.trycloudflare.com ready"),
    "https://demo.trycloudflare.com"
  );
  assert.equal(
    extractPublicUrl(
      "localhostrun",
      "tunneled with tls termination, https://demo.localhost.run"
    ),
    "https://demo.localhost.run"
  );
  assert.equal(
    extractPublicUrl(
      "localtunnel",
      "your url is: https://brave-cat.loca.lt"
    ),
    "https://brave-cat.loca.lt"
  );
});

test("buildNotifyUrl appends the current alipay callback path", () => {
  assert.equal(
    buildNotifyUrl("https://demo.trycloudflare.com"),
    `https://demo.trycloudflare.com${ALIPAY_NOTIFY_PATH}`
  );
});

test("upsertEnvContent updates existing keys and appends missing ones", () => {
  const updated = upsertEnvContent(
    "APP_SECRET=demo\nALIPAY_NOTIFY_URL=https://old.example.com/api/v1/notify/alipay\n",
    "ALIPAY_NOTIFY_URL",
    "https://new.example.com/api/v1/notify/alipay"
  );

  assert.match(
    updated,
    /ALIPAY_NOTIFY_URL=https:\/\/new\.example\.com\/api\/v1\/notify\/alipay/
  );

  const appended = upsertEnvContent("", "ALIPAY_NOTIFY_URL", "https://demo.example.com");
  assert.equal(appended, "ALIPAY_NOTIFY_URL=https://demo.example.com\n");
});
