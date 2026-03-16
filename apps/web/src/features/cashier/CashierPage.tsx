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
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { getApiBaseUrl } from "../../config/runtime-config";

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

interface CashierProviderOption {
  key: string;
  channel: CashierChannel;
  description: string;
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

function resolveProviderName(channel?: CashierChannel): string {
  if (!channel) {
    return "该支付方式";
  }

  if (channel.providerCode === "ALIPAY") {
    return "支付宝";
  }

  if (channel.providerCode === "WECHAT_PAY") {
    return "微信";
  }

  return channel.displayName;
}

function resolveProviderBadgeLabel(channel: CashierChannel): string {
  if (channel.providerCode === "WECHAT_PAY") {
    return "微信";
  }

  if (channel.providerCode === "STRIPE") {
    return "ST";
  }

  if (channel.providerCode === "PAYPAL") {
    return "PP";
  }

  return resolveProviderName(channel).slice(0, 2).toUpperCase();
}

function resolveChannelFailureMessage(channel?: CashierChannel): string {
  const providerName = resolveProviderName(channel);
  const note = channel?.note?.trim();

  if (!note) {
    return `当前${providerName}支付会话创建失败，请返回外部系统重新发起订单。`;
  }

  if (channel?.providerCode === "ALIPAY" && note.includes("ACCESS_FORBIDDEN")) {
    return "当前支付宝应用没有生成扫码二维码的权限，无法调用 alipay.trade.precreate。请在支付宝开放平台确认已开通当面付/扫码支付，并检查当前生效的 AppId 与证书是否匹配。";
  }

  return `当前${providerName}支付会话创建失败：${note}`;
}

function resolveProviderOptionDescription(channel: CashierChannel): string {
  if (channel.sessionStatus === "READY" && channel.actionType === "QR_CODE") {
    return "进入收银台后直接扫码";
  }

  if (channel.sessionStatus === "READY" && channel.actionType === "REDIRECT_URL") {
    return "进入收银台后自动跳转";
  }

  if (channel.sessionStatus === "FAILED") {
    return "当前支付会话暂不可用";
  }

  return "正在获取支付会话";
}

function resolveQrTitle(channel: CashierChannel): string {
  if (channel.providerCode === "ALIPAY") {
    return "支付宝扫码支付";
  }

  if (channel.providerCode === "WECHAT_PAY") {
    return "微信扫码支付";
  }

  return `${resolveProviderName(channel)}扫码支付`;
}

function resolveQrDescription(channel: CashierChannel): string {
  if (channel.providerCode === "ALIPAY") {
    return "请使用支付宝 App 扫码完成支付";
  }

  if (channel.providerCode === "WECHAT_PAY") {
    return "请使用微信扫一扫完成支付";
  }

  return `请使用${resolveProviderName(channel)}完成支付`;
}

function resolveRedirectDescription(channel: CashierChannel): string {
  return `平台已为当前订单匹配 ${resolveProviderName(
    channel
  )} 支付链路，如果页面没有自动跳转，请点击下方按钮继续。`;
}

function resolvePendingTitle(channel?: CashierChannel): string {
  if (!channel) {
    return "请选择支付品牌";
  }

  return `正在准备${resolveProviderName(channel)}支付`;
}

function resolveProviderRoutingWeight(
  channel: CashierChannel,
  terminal: CashierTerminal
): number {
  if (channel.providerCode === "ALIPAY") {
    if (terminal === "mobile") {
      if (channel.channel === "alipay_wap") {
        return 30;
      }

      return channel.channel === "alipay_page" ? 20 : 10;
    }

    if (channel.channel === "alipay_qr") {
      return 30;
    }

    return channel.channel === "alipay_page" ? 20 : 10;
  }

  if (channel.providerCode === "WECHAT_PAY") {
    if (terminal === "mobile") {
      return channel.channel === "wechat_jsapi" ? 30 : 20;
    }

    return channel.channel === "wechat_qr" ? 30 : 10;
  }

  return 0;
}

function getChannelSelectionPriority(
  channel: CashierChannel,
  terminal: CashierTerminal
): number {
  const statusWeight =
    channel.sessionStatus === "READY"
      ? 200
      : channel.sessionStatus === "PENDING"
        ? 100
        : 0;
  const actionWeight =
    channel.actionType === "QR_CODE"
      ? 30
      : channel.actionType === "REDIRECT_URL"
        ? 20
        : 0;

  return statusWeight + actionWeight + resolveProviderRoutingWeight(channel, terminal);
}

function selectPreferredProviderChannel(
  channels: CashierChannel[],
  terminal: CashierTerminal
): CashierChannel | undefined {
  return [...channels].sort(
    (left, right) =>
      getChannelSelectionPriority(right, terminal) -
      getChannelSelectionPriority(left, terminal)
  )[0];
}

function buildProviderOptions(
  channels: CashierChannel[],
  terminal: CashierTerminal
): CashierProviderOption[] {
  const grouped = new Map<string, CashierChannel[]>();

  for (const channel of channels) {
    const key = channel.providerCode || channel.channel;
    const bucket = grouped.get(key);

    if (bucket) {
      bucket.push(channel);
      continue;
    }

    grouped.set(key, [channel]);
  }

  return [...grouped.entries()]
    .map(([key, providerChannels]) => {
      const channel = selectPreferredProviderChannel(providerChannels, terminal);

      if (!channel) {
        return undefined;
      }

      return {
        key,
        channel,
        description: resolveProviderOptionDescription(channel)
      };
    })
    .filter((item): item is CashierProviderOption => Boolean(item));
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

function renderProviderIcon(channel: CashierChannel) {
  if (channel.providerCode === "ALIPAY") {
    return <AlipayCircleFilled className="cashier-method-icon" />;
  }

  return (
    <span className="cashier-method-badge cashier-method-badge-generic">
      {resolveProviderBadgeLabel(channel)}
    </span>
  );
}

export function CashierPage() {
  const { cashierToken } = useParams();
  const [searchParams] = useSearchParams();
  const terminal = useMemo(() => detectCashierTerminal(), []);
  const tokenPayload = useMemo(
    () => parseCashierTokenPayload(cashierToken),
    [cashierToken]
  );
  const preferredProviderFromQuery = searchParams.get("selectedProvider")?.trim() || null;
  const providerReturn = searchParams.get("providerReturn")?.trim() || null;
  const suppressAutoRedirect =
    providerReturn === "cancel" || providerReturn === "success";
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
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const redirectedPayUrlRef = useRef<string | null>(null);
  const tokenExpireAt = tokenPayload?.expireTime
    ? new Date(tokenPayload.expireTime).getTime()
    : Number.NaN;
  const tokenExpired =
    Number.isFinite(tokenExpireAt) && tokenExpireAt <= Date.now();

  useEffect(() => {
    setCashierState(null);
    setSelectedProvider(null);
    setLoading(true);
    setError(null);
    redirectedPayUrlRef.current = null;
  }, [cashierToken, preferredProviderFromQuery, providerReturn]);

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
    const apiBaseUrl = getApiBaseUrl();

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
  }, [
    cashierToken,
    preferredProviderFromQuery,
    providerReturn,
    reloadKey,
    terminal,
    tokenExpired,
    tokenPayload
  ]);

  const orderInfo = cashierState?.order ?? fallbackOrder;
  const returnUrl = orderInfo.returnUrl?.trim();
  const providerOptions = useMemo(
    () => buildProviderOptions(cashierState?.channels ?? [], terminal),
    [cashierState?.channels, terminal]
  );
  const hasMultipleProviders = providerOptions.length > 1;

  useEffect(() => {
    if (providerOptions.length === 0) {
      setSelectedProvider(null);
      return;
    }

    setSelectedProvider((current) => {
      if (
        preferredProviderFromQuery &&
        providerOptions.some((option) => option.key === preferredProviderFromQuery)
      ) {
        return preferredProviderFromQuery;
      }

      if (providerOptions.length === 1) {
        return providerOptions[0]?.key ?? null;
      }

      if (current && providerOptions.some((option) => option.key === current)) {
        return current;
      }

      return null;
    });
  }, [preferredProviderFromQuery, providerOptions]);

  const selectedProviderOption =
    providerOptions.find((option) => option.key === selectedProvider) ??
    (providerOptions.length === 1 ? providerOptions[0] : undefined);
  const selectedChannel = selectedProviderOption?.channel;
  const pollingChannel =
    selectedChannel ??
    providerOptions.find((option) => option.channel.sessionStatus !== "FAILED")?.channel ??
    providerOptions[0]?.channel;
  const shouldPoll =
    Boolean(cashierToken) &&
    !isTerminalStatus(orderInfo.status) &&
    Boolean(pollingChannel) &&
    pollingChannel?.sessionStatus !== "FAILED";
  const redirectUrl =
    selectedChannel?.sessionStatus === "READY" &&
    selectedChannel.actionType === "REDIRECT_URL"
      ? selectedChannel.payUrl?.trim()
      : undefined;

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

  useEffect(() => {
    if (!redirectUrl) {
      redirectedPayUrlRef.current = null;
      return;
    }

    if (hasMultipleProviders && !selectedProvider) {
      return;
    }

    if (redirectedPayUrlRef.current === redirectUrl) {
      return;
    }

    if (suppressAutoRedirect) {
      redirectedPayUrlRef.current = redirectUrl;
      return;
    }

    redirectedPayUrlRef.current = redirectUrl;

    const timer = window.setTimeout(() => {
      window.location.replace(redirectUrl);
    }, 200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [redirectUrl, hasMultipleProviders, selectedProvider, suppressAutoRedirect]);

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

        <div
          className={`cashier-content${hasMultipleProviders ? "" : " cashier-content-single"}`}
        >
          {hasMultipleProviders ? (
            <div className="cashier-column">
              <Typography.Text strong>选择支付品牌</Typography.Text>
              {providerOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={`cashier-method ${
                    selectedProvider === option.key ? "cashier-method-active" : ""
                  }`}
                  onClick={() => setSelectedProvider(option.key)}
                >
                  <span className="cashier-method-main">
                    {renderProviderIcon(option.channel)}
                    <span>
                      <span className="cashier-method-title">
                        {option.channel.displayName}
                      </span>
                      <span className="cashier-method-desc">{option.description}</span>
                    </span>
                  </span>
                  {selectedProvider === option.key ? (
                    <CheckCircleFilled className="cashier-method-check" />
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}

          <div className="cashier-column">
            <Card className="cashier-panel" bordered={false}>
              {!selectedChannel ? (
                <Space direction="vertical" size={12} className="cashier-panel-content">
                  <Typography.Title level={4} style={{ margin: 0 }}>
                    {resolvePendingTitle()}
                  </Typography.Title>
                  <Typography.Text type="secondary">
                    {hasMultipleProviders
                      ? "当前订单支持多个支付品牌，请先选择一个支付品牌继续付款。"
                      : "当前订单尚未返回可用的支付会话。"}
                  </Typography.Text>
                </Space>
              ) : selectedChannel.sessionStatus === "READY" &&
                selectedChannel.actionType === "QR_CODE" &&
                selectedChannel.qrContent ? (
                <Space direction="vertical" size={16} className="cashier-panel-content">
                  <Typography.Title level={4} style={{ margin: 0 }}>
                    {resolveQrTitle(selectedChannel)}
                  </Typography.Title>
                  <QRCode value={selectedChannel.qrContent} size={220} />
                  <Typography.Text type="secondary">
                    {resolveQrDescription(selectedChannel)}
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
                    重新获取支付会话
                  </Button>
                </Space>
              ) : selectedChannel.sessionStatus === "READY" &&
                selectedChannel.actionType === "REDIRECT_URL" &&
                redirectUrl ? (
                <Space direction="vertical" size={12} className="cashier-panel-content">
                  {suppressAutoRedirect ? (
                    <Alert
                      type="info"
                      showIcon
                      message={`已从${resolveProviderName(selectedChannel)}返回`}
                      description="如果你已经完成支付，请等待页面自动刷新；如果需要继续付款，可以再次点击下方按钮。"
                    />
                  ) : (
                    <Spin />
                  )}
                  <Typography.Title level={4} style={{ margin: 0 }}>
                    {suppressAutoRedirect
                      ? `等待${resolveProviderName(selectedChannel)}支付结果`
                      : `正在跳转到${resolveProviderName(selectedChannel)}`}
                  </Typography.Title>
                  <Typography.Text type="secondary">
                    {suppressAutoRedirect
                      ? "平台已暂停自动跳转，避免你从支付页返回后再次进入同一个支付会话。"
                      : resolveRedirectDescription(selectedChannel)}
                  </Typography.Text>
                  <Button type="primary" onClick={() => window.location.replace(redirectUrl)}>
                    {suppressAutoRedirect
                      ? `重新前往${resolveProviderName(selectedChannel)}`
                      : `立即前往${resolveProviderName(selectedChannel)}`}
                  </Button>
                </Space>
              ) : (
                <Space direction="vertical" size={12} className="cashier-panel-content">
                  <Spin />
                  <Typography.Title level={4} style={{ margin: 0 }}>
                    {resolvePendingTitle(selectedChannel)}
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
