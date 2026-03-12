import { createHash, createHmac } from "node:crypto";

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3000/api/v1";
const appId = process.env.APP_ID ?? "demo_app";
const merchantSecret = process.env.MERCHANT_SECRET ?? "demo_app_secret";
const apiBasePath = new URL(apiBaseUrl).pathname.replace(/\/$/, "");

async function main() {
  const merchantOrderNo = `ORDER_SMOKE_${Date.now()}`;
  const createOrderPayload = {
    merchantOrderNo,
    amount: 199,
    currency: "CNY",
    subject: "Smoke Test Order",
    description: "merchant signed request smoke test",
    notifyUrl: "https://merchant.example.com/pay/notify",
    returnUrl: "https://merchant.example.com/pay/result",
    expireInSeconds: 900,
    allowedChannels: ["alipay_qr"],
    metadata: {
      scene: "smoke_test"
    }
  };
  const createOrderIdempotencyKey = `idem_create_${merchantOrderNo}`;
  const closeOrderIdempotencyKey = `idem_close_${merchantOrderNo}`;

  const createResult = await signedFetch("POST", "/orders", createOrderPayload, {
    idempotencyKey: createOrderIdempotencyKey
  });
  const replayCreateResult = await signedFetch(
    "POST",
    "/orders",
    createOrderPayload,
    {
      idempotencyKey: createOrderIdempotencyKey
    }
  );

  assert(
    createResult.data.platformOrderNo === replayCreateResult.data.platformOrderNo,
    "Create order idempotency replay mismatch"
  );

  const merchantOrderQueryResult = await signedFetch(
    "GET",
    `/orders?merchantOrderNo=${encodeURIComponent(merchantOrderNo)}`
  );
  const platformOrderNo = createResult.data.platformOrderNo;
  const platformOrderQueryResult = await signedFetch(
    "GET",
    `/orders/${platformOrderNo}`
  );
  const cashierToken = new URL(createResult.data.cashierUrl).pathname.split("/").pop();
  const cashierResult = await fetchJson(`${apiBaseUrl}/cashier/${cashierToken}`);
  const closeResult = await signedFetch(
    "POST",
    `/orders/${platformOrderNo}/close`,
    {
      reason: "smoke_test_close"
    },
    {
      idempotencyKey: closeOrderIdempotencyKey
    }
  );
  const replayCloseResult = await signedFetch(
    "POST",
    `/orders/${platformOrderNo}/close`,
    {
      reason: "smoke_test_close"
    },
    {
      idempotencyKey: closeOrderIdempotencyKey
    }
  );
  const closedOrderQueryResult = await signedFetch(
    "GET",
    `/orders/${platformOrderNo}`
  );
  const replayTimestamp = Date.now().toString();
  const replayNonce = `nonce_replay_${Date.now()}`;

  await signedFetch(
    "GET",
    `/orders/${platformOrderNo}`,
    undefined,
    {
      fixedTimestamp: replayTimestamp,
      fixedNonce: replayNonce
    }
  );
  const replayProtectionResult = await expectFailure(
    () =>
      signedFetch(
        "GET",
        `/orders/${platformOrderNo}`,
        undefined,
        {
          fixedTimestamp: replayTimestamp,
          fixedNonce: replayNonce
        }
      ),
    "NONCE_REPLAY"
  );

  assert(
    closeResult.data.platformOrderNo === replayCloseResult.data.platformOrderNo,
    "Close order idempotency replay mismatch"
  );
  assert(closeResult.data.status === "CLOSED", "Close order should return CLOSED");
  assert(
    closedOrderQueryResult.data.status === "CLOSED",
    "Closed order query should return CLOSED"
  );
  assert(
    merchantOrderQueryResult.data.platformOrderNo === platformOrderNo,
    "Query by merchant order no mismatch"
  );
  assert(
    platformOrderQueryResult.data.platformOrderNo === platformOrderNo,
    "Query by platform order no mismatch"
  );
  assert(
    Array.isArray(cashierResult.data.channels),
    "Cashier session should contain channels"
  );
  assert(
    replayProtectionResult.code === "NONCE_REPLAY",
    "Nonce replay should return NONCE_REPLAY"
  );

  console.log("Smoke test passed");
  console.log(
    JSON.stringify(
      {
        appId,
        merchantOrderNo,
        platformOrderNo,
        cashierUrl: createResult.data.cashierUrl,
        createStatus: createResult.data.status,
        closeStatus: closeResult.data.status
      },
      null,
      2
    )
  );
}

async function signedFetch(method, path, body, options = {}) {
  const timestamp = options.fixedTimestamp ?? Date.now().toString();
  const nonce = options.fixedNonce ?? randomNonce();
  const canonicalBody = typeof body === "undefined" ? "" : stableStringify(body);
  const content = [
    method.toUpperCase(),
    canonicalPath(`${apiBasePath}${path}`),
    appId,
    timestamp,
    nonce,
    sha256Hex(canonicalBody)
  ].join("\n");
  const signature = createHmac("sha256", merchantSecret)
    .update(content)
    .digest("hex");
  const headers = {
    "Content-Type": "application/json",
    "X-App-Id": appId,
    "X-Timestamp": timestamp,
    "X-Nonce": nonce,
    "X-Sign-Type": "HMAC-SHA256",
    "X-Sign": signature,
    ...(options.idempotencyKey
      ? { "Idempotency-Key": options.idempotencyKey }
      : {})
  };
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers,
    body: typeof body === "undefined" ? undefined : JSON.stringify(body)
  });
  const json = await response.json();

  if (!response.ok) {
    throw new Error(`Request failed ${response.status}: ${JSON.stringify(json)}`);
  }

  return json;
}

async function expectFailure(execute, expectedCode) {
  try {
    await execute();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const matched = message.match(/\{.*\}$/);

    if (!matched) {
      throw error;
    }

    const payload = JSON.parse(matched[0]);

    if (payload.code !== expectedCode) {
      throw error;
    }

    return payload;
  }

  throw new Error(`Expected failure code ${expectedCode}`);
}

async function fetchJson(url) {
  const response = await fetch(url);
  const json = await response.json();

  if (!response.ok) {
    throw new Error(`Request failed ${response.status}: ${JSON.stringify(json)}`);
  }

  return json;
}

function canonicalPath(path) {
  const url = new URL(path, "http://localhost");
  const entries = [...url.searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) => {
    if (leftKey === rightKey) {
      return leftValue.localeCompare(rightValue);
    }

    return leftKey.localeCompare(rightKey);
  });
  const query = new URLSearchParams(entries).toString();

  return query ? `${url.pathname}?${query}` : url.pathname;
}

function stableStringify(value) {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonValue(item));
  }

  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = sortJsonValue(value[key]);

        return result;
      }, {});
  }

  return value;
}

function sha256Hex(content) {
  return createHash("sha256").update(content).digest("hex");
}

function randomNonce() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
