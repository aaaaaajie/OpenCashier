import { AlipayCircleFilled, CheckCircleFilled } from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  QRCode,
  Result,
  Space,
  Spin,
  Typography
} from "antd";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

interface CashierOrder {
  platformOrderNo: string;
  amount: number;
  currency: string;
  expireTime: string;
  status: string;
  subject?: string;
  description?: string;
  returnUrl?: string;
}

interface CashierChannel {
  providerCode: string;
  channel: string;
  displayName: string;
  integrationMode: string;
  enabled: boolean;
  sessionStatus: "PENDING" | "READY" | "FAILED";
  actionType: "NONE" | "QR_CODE" | "REDIRECT_URL";
  attemptNo?: string;
  qrContent?: string;
  payUrl?: string;
  sdkPackage?: string;
  note: string;
  providerPayload?: Record<string, unknown>;
}

interface CashierTokenPayload {
  platformOrderNo?: string;
  expireTime?: string;
}

type CashierTerminal = "desktop" | "mobile";

function formatAmount(amount: number, currency: string) {
  if (currency === "CNY") {
    return `¥${(amount / 100).toFixed(2)}`;
  }

  return `${(amount / 100).toFixed(2)} ${currency}`;
}

function formatExpireTime(expireTime: string) {
  const value = new Date(expireTime);

  if (Number.isNaN(value.getTime())) {
    return expireTime;
  }

  return `请在 ${value.toLocaleString("zh-CN", { hour12: false })} 前完成支付`;
}

function isTerminalStatus(status: string) {
  return status === "SUCCESS" || status === "CLOSED" || status === "EXPIRED";
}

function resolveChannelFailureMessage(channel?: CashierChannel): string {
  const note = channel?.note?.trim();

  if (!note) {
    return "当前支付宝支付会话创建失败，请返回外部系统重新发起订单。";
  }

  if (note.includes("ACCESS_FORBIDDEN")) {
    return "当前支付宝应用没有生成扫码二维码的权限，无法调用 alipay.trade.precreate。请在支付宝开放平台确认已开通当面付/扫码支付，并检查当前生效的 AppId 与证书是否匹配。";
  }

  return `当前支付宝支付会话创建失败：${note}`;
}

function detectCashierTerminal(): CashierTerminal {
  if (typeof window === "undefined") {
    return "desktop";
  }

  const userAgent = window.navigator.userAgent.toLowerCase();

  if (
    /iphone|ipad|ipod|android|mobile|micromessenger/.test(userAgent) ||
    window.innerWidth <= 768
  ) {
    return "mobile";
  }

  return "desktop";
}

function getAlipayChannelPriority(
  channel: CashierChannel,
  terminal: CashierTerminal
): number {
  const statusWeight =
    channel.sessionStatus === "READY"
      ? 100
      : channel.sessionStatus === "PENDING"
        ? 50
        : 0;

  const channelWeight =
    terminal === "mobile"
      ? channel.channel === "alipay_wap"
        ? 30
        : channel.channel === "alipay_page"
          ? 20
          : 10
      : channel.channel === "alipay_qr"
        ? 30
        : channel.channel === "alipay_page"
          ? 20
          : 10;

  return statusWeight + channelWeight;
}

function selectPreferredAlipayChannel(
  channels: CashierChannel[],
  terminal: CashierTerminal
): CashierChannel | undefined {
  return [...channels].sort(
    (left, right) =>
      getAlipayChannelPriority(right, terminal) -
      getAlipayChannelPriority(left, terminal)
  )[0];
}

function parseCashierTokenPayload(
  cashierToken?: string
): CashierTokenPayload | null {
  if (!cashierToken) {
    return null;
  }

  const [encodedPayload] = cashierToken.split(".");

  if (!encodedPayload) {
    return null;
  }

  try {
    const normalized = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "="
    );
    const payload = JSON.parse(atob(padded)) as CashierTokenPayload;

    if (!payload.platformOrderNo || !payload.expireTime) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function CashierPage() {
  const { cashierToken } = useParams();
  const terminal = useMemo(() => detectCashierTerminal(), []);
  const tokenPayload = useMemo(
    () => parseCashierTokenPayload(cashierToken),
    [cashierToken]
  );
  const fallbackOrder = useMemo<CashierOrder>(
    () => ({
      platformOrderNo: tokenPayload?.platformOrderNo ?? cashierToken ?? "",
      amount: 0,
      currency: "CNY",
      expireTime:
        tokenPayload?.expireTime ??
        new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      status: "WAIT_PAY",
      subject: "支付订单"
    }),
    [cashierToken, tokenPayload]
  );
  const [cashierState, setCashierState] = useState<{
    order: CashierOrder;
    channels: CashierChannel[];
  } | null>(null);
  const [selectedMethod, setSelectedMethod] = useState("alipay");
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tokenExpireAt = tokenPayload?.expireTime
    ? new Date(tokenPayload.expireTime).getTime()
    : Number.NaN;
  const tokenExpired =
    Number.isFinite(tokenExpireAt) && tokenExpireAt <= Date.now();

  useEffect(() => {
    setCashierState(null);
    setSelectedMethod("alipay");
    setLoading(true);
    setError(null);
  }, [cashierToken]);

  useEffect(() => {
    if (!cashierToken) {
      setLoading(false);
      setError("INVALID_CASHIER_TOKEN");
      return;
    }

    if (!tokenPayload) {
      setLoading(false);
      setError("INVALID_CASHIER_TOKEN");
      return;
    }

    if (tokenExpired) {
      setLoading(false);
      setError("EXPIRED_CASHIER_TOKEN");
      return;
    }

    let cancelled = false;
    const apiBaseUrl =
      import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";

    async function loadCashierSession() {
      if (!cashierState) {
        setLoading(true);
      }

      try {
        const response = await fetch(
          `${apiBaseUrl}/cashier/${cashierToken}?terminal=${terminal}`
        );

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error("CASHIER_NOT_FOUND");
          }

          throw new Error(`cashier request failed: ${response.status}`);
        }

        const json = (await response.json()) as {
          data: {
            order: CashierOrder;
            channels: CashierChannel[];
          };
        };

        if (cancelled) {
          return;
        }

        setCashierState(json.data);
        setError(null);
      } catch (caught) {
        if (cancelled) {
          return;
        }

        setError(
          caught instanceof Error ? caught.message : "Failed to load cashier data"
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadCashierSession();

    return () => {
      cancelled = true;
    };
  }, [cashierToken, reloadKey, terminal, tokenExpired, tokenPayload]);

  const orderInfo = cashierState?.order ?? fallbackOrder;
  const returnUrl = orderInfo.returnUrl?.trim();
  const alipayChannel = selectPreferredAlipayChannel(
    cashierState?.channels.filter(
      (item) => item.providerCode === "ALIPAY" || item.channel.startsWith("alipay")
    ) ?? [],
    terminal
  );
  const shouldPoll =
    Boolean(cashierToken) &&
    !isTerminalStatus(orderInfo.status) &&
    alipayChannel?.sessionStatus !== "FAILED";

  useEffect(() => {
    if (!shouldPoll) {
      return;
    }

    const timer = window.setInterval(() => {
      setReloadKey((value) => value + 1);
    }, 3000);

    return () => {
      window.clearInterval(timer);
    };
  }, [shouldPoll]);

  useEffect(() => {
    if (orderInfo.status !== "SUCCESS" || !returnUrl) {
      return;
    }

    const timer = window.setTimeout(() => {
      window.location.replace(returnUrl);
    }, 1500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [orderInfo.status, returnUrl]);

  if (!cashierToken) {
    return (
      <div className="cashier-shell">
        <Card className="cashier-card">
          <Result status="error" title="收银台地址无效" />
        </Card>
      </div>
    );
  }

  if (loading && !cashierState) {
    return (
      <div className="cashier-shell">
        <Card className="cashier-card">
          <div className="cashier-loading">
            <Spin size="large" />
            <Typography.Text type="secondary">正在加载支付信息</Typography.Text>
          </div>
        </Card>
      </div>
    );
  }

  if (error && !cashierState) {
    const isExpiredError = error === "EXPIRED_CASHIER_TOKEN";
    const isInvalidTokenError =
      error === "INVALID_CASHIER_TOKEN" || error === "CASHIER_NOT_FOUND";

    return (
      <div className="cashier-shell">
        <Card className="cashier-card">
          <Result
            status={isInvalidTokenError ? "error" : "warning"}
            title={
              isExpiredError
                ? "收银台链接已过期"
                : isInvalidTokenError
                  ? "收银台地址无效"
                  : "收银台暂时不可用"
            }
            subTitle={
              isExpiredError
                ? "当前订单支付时效已结束，请返回外部系统重新发起支付。"
                : isInvalidTokenError
                  ? "当前链接无法识别，请重新获取外部系统返回的收银台地址。"
                  : error
            }
            extra={
              !isExpiredError && !isInvalidTokenError ? (
                <Button type="primary" onClick={() => setReloadKey((value) => value + 1)}>
                  重新加载
                </Button>
              ) : returnUrl ? (
                <Button type="primary" onClick={() => window.location.replace(returnUrl)}>
                  返回外部系统
                </Button>
              ) : null
            }
          />
        </Card>
      </div>
    );
  }

  if (orderInfo.status === "SUCCESS") {
    return (
      <div className="cashier-shell">
        <Card className="cashier-card cashier-result-card">
          <Result
            status="success"
            title="支付成功"
            subTitle={
              returnUrl
                ? "支付已完成，正在返回外部系统。"
                : "支付已完成，当前页面可以关闭。"
            }
            extra={
              returnUrl ? (
                <Button type="primary" onClick={() => window.location.replace(returnUrl)}>
                  返回外部系统
                </Button>
              ) : null
            }
          />
        </Card>
      </div>
    );
  }

  if (orderInfo.status === "CLOSED" || orderInfo.status === "EXPIRED") {
    return (
      <div className="cashier-shell">
        <Card className="cashier-card cashier-result-card">
          <Result
            status="warning"
            title={orderInfo.status === "EXPIRED" ? "订单已过期" : "订单已关闭"}
            subTitle="当前订单无法继续支付，请返回外部系统重新发起。"
            extra={
              returnUrl ? (
                <Button type="primary" onClick={() => window.location.replace(returnUrl)}>
                  返回外部系统
                </Button>
              ) : null
            }
          />
        </Card>
      </div>
    );
  }

  const selectedChannel = selectedMethod === "alipay" ? alipayChannel : undefined;

  return (
    <div className="cashier-shell">
      <Card className="cashier-card">
        {error ? (
          <Alert
            type="warning"
            showIcon
            message="支付状态同步延迟"
            description="当前先展示最近一次支付会话，页面会继续自动刷新。"
            style={{ marginBottom: 24 }}
          />
        ) : null}

        <div className="cashier-hero">
          <Typography.Title level={2} className="cashier-title">
            统一收银台
          </Typography.Title>
          <Typography.Text className="cashier-amount">
            {formatAmount(orderInfo.amount, orderInfo.currency)}
          </Typography.Text>
          <Typography.Paragraph className="cashier-subject">
            {orderInfo.subject ?? "支付订单"}
          </Typography.Paragraph>
          <Typography.Text type="secondary">
            {formatExpireTime(orderInfo.expireTime)}
          </Typography.Text>
        </div>

        <div className="cashier-content">
          <div className="cashier-column">
            <Typography.Text strong>选择支付方式</Typography.Text>
            <button
              type="button"
              className={`cashier-method ${
                selectedMethod === "alipay" ? "cashier-method-active" : ""
              }`}
              onClick={() => setSelectedMethod("alipay")}
            >
              <span className="cashier-method-main">
                <AlipayCircleFilled className="cashier-method-icon" />
                <span>
                  <span className="cashier-method-title">支付宝</span>
                </span>
              </span>
              {selectedMethod === "alipay" ? (
                <CheckCircleFilled className="cashier-method-check" />
              ) : null}
            </button>
          </div>

          <div className="cashier-column">
            <Card className="cashier-panel" bordered={false}>
              {!selectedChannel ? (
                <Space direction="vertical" size={12} className="cashier-panel-content">
                  <Typography.Title level={4} style={{ margin: 0 }}>
                    支付方式暂未开通
                  </Typography.Title>
                  <Typography.Text type="secondary">
                    当前订单尚未返回可用的支付宝支付会话。
                  </Typography.Text>
                </Space>
              ) : selectedChannel.sessionStatus === "READY" &&
                selectedChannel.qrContent ? (
                <Space direction="vertical" size={16} className="cashier-panel-content">
                  <Typography.Title level={4} style={{ margin: 0 }}>
                    支付宝扫码支付
                  </Typography.Title>
                  <QRCode value={selectedChannel.qrContent} size={220} />
                  <Typography.Text type="secondary">
                    请使用支付宝 App 扫码完成支付
                  </Typography.Text>
                </Space>
              ) : selectedChannel.sessionStatus === "FAILED" ? (
                <Space direction="vertical" size={12} className="cashier-panel-content">
                  <Typography.Title level={4} style={{ margin: 0 }}>
                    支付方式暂不可用
                  </Typography.Title>
                  <Typography.Text type="secondary">
                    {resolveChannelFailureMessage(selectedChannel)}
                  </Typography.Text>
                  {selectedChannel.note ? (
                    <Alert
                      type="warning"
                      showIcon
                      message="渠道返回信息"
                      description={selectedChannel.note}
                    />
                  ) : null}
                  <Button type="primary" onClick={() => setReloadKey((value) => value + 1)}>
                    重新获取二维码
                  </Button>
                </Space>
              ) : selectedChannel.actionType === "REDIRECT_URL" && selectedChannel.payUrl ? (
                <Space direction="vertical" size={12} className="cashier-panel-content">
                  <Button type="primary" href={selectedChannel.payUrl} target="_blank">
                    前往支付宝
                  </Button>
                </Space>
              ) : (
                <Space direction="vertical" size={12} className="cashier-panel-content">
                  <Spin />
                  <Typography.Title level={4} style={{ margin: 0 }}>
                    正在生成支付宝二维码
                  </Typography.Title>
                  <Typography.Text type="secondary">
                    页面会自动刷新支付状态，请稍候。
                  </Typography.Text>
                </Space>
              )}
            </Card>
          </div>
        </div>
      </Card>
    </div>
  );
}
