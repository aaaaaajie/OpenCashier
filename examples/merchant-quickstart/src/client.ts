import { type QuickstartConfig } from "./config";
import { type QuickstartOrder } from "./store";

export function renderQuickstartErrorPage(message: string): string {
  return renderPage(
    "Quickstart Error",
    `
      <section class="card stack">
        <h1>Quickstart error</h1>
        <p>${escapeHtml(message)}</p>
        <p><a href="/">Back to home</a></p>
      </section>
    `
  );
}

export function renderNotFoundPage(): string {
  return renderPage(
    "Not Found",
    `
      <section class="card stack">
        <h1>Not found</h1>
        <p>The quickstart only exposes a few routes on purpose.</p>
        <p><a href="/">Back to home</a></p>
      </section>
    `
  );
}

export function renderHomePage(
  config: QuickstartConfig,
  recentOrders: QuickstartOrder[]
): string {
  return renderPage(
    "Merchant Quickstart",
    `
      <section class="card stack">
        <p class="eyebrow">Merchant Integration</p>
        <h1>OpenCashier merchant quickstart</h1>
        <p>
          Minimal merchant-side reference for OpenCashier. The default path signs one
          create-order request, redirects to <code>cashierUrl</code>, accepts one async
          notification, and queries order status on the result page.
        </p>
        <ul class="checklist">
          <li>Single process, no separate frontend build</li>
          <li>Orders stored in a local JSON file</li>
          <li>Only the core merchant integration loop</li>
        </ul>
        <form method="post" action="/checkout">
          <button type="submit">Create Order And Redirect</button>
        </form>
      </section>

      <section class="grid">
        <article class="card stack">
          <h2>Current config</h2>
          <dl class="meta-list">
            <div><dt>APP_BASE_URL</dt><dd>${escapeHtml(config.appBaseUrl)}</dd></div>
            <div><dt>OPENCASHIER_API_BASE_URL</dt><dd>${escapeHtml(config.apiBaseUrl)}</dd></div>
            <div><dt>OPENCASHIER_APP_ID</dt><dd>${escapeHtml(config.appId)}</dd></div>
            <div><dt>OPENCASHIER_NOTIFY_URL</dt><dd>${escapeHtml(config.notifyUrl)}</dd></div>
            <div><dt>OPENCASHIER_ALLOWED_CHANNELS</dt><dd>${escapeHtml(config.allowedChannels.join(", "))}</dd></div>
          </dl>
          <p class="hint">
            The quickstart loads <code>.env</code> from this directory. When
            <code>OPENCASHIER_BOOTSTRAP_PROVIDER_CONFIG=1</code>, the startup script
            prepares one app-scoped provider config before this server starts.
          </p>
          <p><a href="https://opencashier-docs.vercel.app/en/provider-config-reference#merchant-quickstart" target="_blank" rel="noreferrer">Provider config reference</a></p>
        </article>

        <article class="card stack">
          <h2>Request flow</h2>
          <ol class="flow-list">
            <li>POST <code>/checkout</code> signs and sends a create-order request.</li>
            <li>OpenCashier returns <code>cashierUrl</code>.</li>
            <li>The browser is redirected to the hosted cashier.</li>
            <li>OpenCashier calls <code>/notify/opencashier</code>.</li>
            <li><code>/result</code> queries order status again as a fallback.</li>
          </ol>
          <p><a href="/orders">View recent orders</a></p>
        </article>
      </section>

      <section class="card stack">
        <h2>Recent orders</h2>
        ${renderOrdersTable(recentOrders)}
      </section>
    `
  );
}

export function renderCreateOrderFailedPage(message: string): string {
  return renderPage(
    "Create Order Failed",
    `
      <section class="card stack">
        <h1>Create order failed</h1>
        <p>${escapeHtml(message)}</p>
        <p><a href="/">Back to home</a></p>
      </section>
    `
  );
}

export function renderMissingOrderPage(): string {
  return renderPage(
    "Missing Order",
    `
      <section class="card stack">
        <h1>Missing merchant order number</h1>
        <p>This page expects a <code>merchantOrderNo</code> query parameter.</p>
        <p><a href="/">Back to home</a></p>
      </section>
    `
  );
}

export function renderResultPage(
  merchantOrderNo: string,
  order: QuickstartOrder | undefined,
  queryError: string | null
): string {
  return renderPage(
    "Payment Result",
    `
      <section class="card stack">
        <p class="eyebrow">Result</p>
        <h1>Merchant order ${escapeHtml(merchantOrderNo)}</h1>
        <p>
          This page queries OpenCashier before rendering. Compare the queried state with
          the local store snapshot below.
        </p>
        <div class="action-row">
          <a href="/">Create another order</a>
          <a href="/orders">View recent orders</a>
          ${
            order?.cashierUrl
              ? `<a href="${escapeAttribute(order.cashierUrl)}">Open cashier again</a>`
              : ""
          }
        </div>
      </section>

      ${
        queryError
          ? `
            <section class="card stack warning">
              <h2>Order query failed</h2>
              <p>${escapeHtml(queryError)}</p>
            </section>
          `
          : ""
      }

      <section class="card stack">
        <h2>Local order snapshot</h2>
        ${
          order
            ? renderOrderDetail(order)
            : "<p>No local order record was found for this merchant order number.</p>"
        }
      </section>
    `
  );
}

export function renderOrdersPage(orders: QuickstartOrder[]): string {
  return renderPage(
    "Recent Orders",
    `
      <section class="card stack">
        <p class="eyebrow">Local Store</p>
        <h1>Recent orders</h1>
        <p>
          Rows below come from the local JSON store. <code>lastSource</code> shows
          whether the latest write came from create, notify, or query.
        </p>
        <div class="action-row">
          <a href="/">Back to home</a>
        </div>
      </section>

      <section class="card stack">
        ${renderOrdersTable(orders)}
      </section>
    `
  );
}

function renderOrdersTable(orders: QuickstartOrder[]): string {
  if (orders.length === 0) {
    return `
      <p class="hint">
        No orders recorded yet.
      </p>
    `;
  }

  const rows = orders
    .map(
      (order) => `
        <tr>
          <td><a href="/result?merchantOrderNo=${encodeURIComponent(order.merchantOrderNo)}">${escapeHtml(order.merchantOrderNo)}</a></td>
          <td>${escapeHtml(order.platformOrderNo)}</td>
          <td><span class="badge">${escapeHtml(order.status)}</span></td>
          <td>${escapeHtml(order.lastSource)}</td>
          <td>${escapeHtml(order.channel ?? "-")}</td>
          <td>${escapeHtml(formatDate(order.updatedAt))}</td>
        </tr>
      `
    )
    .join("");

  return `
    <table>
      <thead>
        <tr>
          <th>merchantOrderNo</th>
          <th>platformOrderNo</th>
          <th>Status</th>
          <th>Last source</th>
          <th>Channel</th>
          <th>Updated</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderOrderDetail(order: QuickstartOrder): string {
  return `
    <dl class="meta-list">
      <div><dt>merchantOrderNo</dt><dd>${escapeHtml(order.merchantOrderNo)}</dd></div>
      <div><dt>platformOrderNo</dt><dd>${escapeHtml(order.platformOrderNo)}</dd></div>
      <div><dt>Status</dt><dd>${escapeHtml(order.status)}</dd></div>
      <div><dt>Last source</dt><dd>${escapeHtml(order.lastSource)}</dd></div>
      <div><dt>Last notify event</dt><dd>${escapeHtml(order.lastEventType ?? "-")}</dd></div>
      <div><dt>Last notify id</dt><dd>${escapeHtml(order.lastNotifyId ?? "-")}</dd></div>
      <div><dt>Last query time</dt><dd>${escapeHtml(order.lastQueryAt ? formatDate(order.lastQueryAt) : "-")}</dd></div>
      <div><dt>Channel</dt><dd>${escapeHtml(order.channel ?? "-")}</dd></div>
      <div><dt>Paid time</dt><dd>${escapeHtml(order.paidTime ? formatDate(order.paidTime) : "-")}</dd></div>
      <div><dt>Amount</dt><dd>${escapeHtml(`${order.amount} ${order.currency}`)}</dd></div>
      <div><dt>Created</dt><dd>${escapeHtml(formatDate(order.createdAt))}</dd></div>
      <div><dt>Updated</dt><dd>${escapeHtml(formatDate(order.updatedAt))}</dd></div>
      <div><dt>cashierUrl</dt><dd class="break-all">${order.cashierUrl ? `<a href="${escapeAttribute(order.cashierUrl)}">Open cashier</a>` : "-"}</dd></div>
      <div><dt>notifyUrl</dt><dd class="break-all">${escapeHtml(order.notifyUrl ?? "-")}</dd></div>
      <div><dt>returnUrl</dt><dd class="break-all">${escapeHtml(order.returnUrl ?? "-")}</dd></div>
    </dl>
  `;
}

function renderPage(title: string, content: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f6f2ea;
        --surface: #fffdf9;
        --border: #d7cbb9;
        --text: #1f1c17;
        --muted: #6d6558;
        --accent: #17594a;
        --accent-strong: #0f4136;
        --warning: #fff5de;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Iowan Old Style", "Palatino Linotype", Georgia, serif;
        background:
          radial-gradient(circle at top left, rgba(23, 89, 74, 0.12), transparent 28rem),
          linear-gradient(180deg, #faf6ef 0%, var(--bg) 100%);
        color: var(--text);
      }
      main {
        width: min(960px, calc(100vw - 2rem));
        margin: 0 auto;
        padding: 2rem 0 4rem;
      }
      h1, h2 { margin: 0; line-height: 1.1; }
      h1 { font-size: clamp(2.2rem, 4vw, 3.4rem); }
      h2 { font-size: 1.35rem; }
      p, li, dt, dd, th, td, code, a, button { font-size: 1rem; }
      a { color: var(--accent); }
      code {
        padding: 0.08rem 0.35rem;
        border-radius: 0.35rem;
        background: rgba(23, 89, 74, 0.08);
      }
      .card {
        background: rgba(255, 253, 249, 0.92);
        border: 1px solid var(--border);
        border-radius: 1rem;
        padding: 1.2rem;
        box-shadow: 0 18px 40px rgba(75, 61, 41, 0.08);
      }
      .stack { display: grid; gap: 0.9rem; }
      .grid {
        display: grid;
        gap: 1rem;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        margin: 1rem 0;
      }
      .eyebrow {
        margin: 0;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
        font-size: 0.8rem;
      }
      .hint { color: var(--muted); margin: 0; }
      .warning { background: var(--warning); }
      .checklist, .flow-list {
        margin: 0;
        padding-left: 1.2rem;
        color: var(--text);
      }
      form { margin: 0; }
      button {
        border: 0;
        border-radius: 999px;
        background: var(--accent);
        color: white;
        padding: 0.8rem 1.25rem;
        cursor: pointer;
        font-weight: 600;
      }
      button:hover { background: var(--accent-strong); }
      .action-row {
        display: flex;
        gap: 0.9rem;
        flex-wrap: wrap;
      }
      .meta-list {
        display: grid;
        gap: 0.7rem;
        margin: 0;
      }
      .meta-list div {
        display: grid;
        gap: 0.2rem;
      }
      .meta-list dt {
        color: var(--muted);
        font-size: 0.85rem;
      }
      .meta-list dd {
        margin: 0;
        font-weight: 600;
      }
      .break-all { word-break: break-all; }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        border-bottom: 1px solid rgba(109, 101, 88, 0.18);
        text-align: left;
        padding: 0.8rem 0.5rem;
        vertical-align: top;
      }
      th { color: var(--muted); font-weight: 600; }
      .badge {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 0.2rem 0.65rem;
        background: rgba(23, 89, 74, 0.12);
        color: var(--accent-strong);
        font-weight: 600;
      }
      @media (max-width: 640px) {
        main { width: min(100vw - 1rem, 960px); padding-top: 1rem; }
        .card { padding: 1rem; }
        table, thead, tbody, th, td, tr { display: block; }
        thead { display: none; }
        td {
          border-bottom: 0;
          padding: 0.35rem 0;
        }
        tr {
          border-bottom: 1px solid rgba(109, 101, 88, 0.18);
          padding: 0.6rem 0;
        }
      }
    </style>
  </head>
  <body>
    <main class="stack">${content}</main>
  </body>
</html>`;
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "medium"
  }).format(date);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
