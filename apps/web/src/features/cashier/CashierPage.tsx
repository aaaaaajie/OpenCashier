import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  QRCode,
  Row,
  Result,
  Space,
  Steps,
  Tag,
  Typography
} from "antd";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

export function CashierPage() {
  const { cashierToken } = useParams();
  const fallbackOrderInfo = useMemo(
    () => ({
      platformOrderNo: cashierToken ?? "P202603120001",
      amount: 9900,
      currency: "CNY",
      expireTime: "15 分钟后过期",
      status: "WAIT_PAY",
      channels: ["wechat_qr", "alipay_qr"]
    }),
    [cashierToken]
  );
  const [reloadKey, setReloadKey] = useState(0);
  const [cashierState, setCashierState] = useState<{
    order: {
      platformOrderNo: string;
      amount: number;
      currency: string;
      expireTime: string;
      status: string;
    };
    channels: Array<{
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
    }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cashierToken) {
      return;
    }

    const apiBaseUrl =
      import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";

    async function loadCashierSession() {
      try {
        const response = await fetch(`${apiBaseUrl}/cashier/${cashierToken}`);

        if (!response.ok) {
          throw new Error(`cashier request failed: ${response.status}`);
        }

        const json = (await response.json()) as {
          data: {
            order: {
              platformOrderNo: string;
              amount: number;
              currency: string;
              expireTime: string;
              status: string;
            };
            channels: Array<{
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
            }>;
          };
        };

        setCashierState(json.data);
        setError(null);
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "Failed to load cashier data"
        );
      }
    }

    void loadCashierSession();
  }, [cashierToken, reloadKey]);

  const orderInfo = cashierState?.order ?? fallbackOrderInfo;
  const channels =
    cashierState?.channels ??
    fallbackOrderInfo.channels.map((item) => ({
      channel: item,
      displayName: item,
      integrationMode: "PENDING",
      enabled: false,
      sessionStatus: "PENDING" as const,
      actionType: "NONE" as const,
      note: "当前为本地占位数据，真实渠道会话尚未返回。"
    }));
  const primaryChannel =
    channels.find(
      (item) =>
        item.enabled &&
        item.sessionStatus === "READY" &&
        item.actionType === "QR_CODE" &&
        item.qrContent
    ) ??
    channels.find(
      (item) =>
        item.enabled &&
        item.sessionStatus === "READY" &&
        item.actionType === "REDIRECT_URL" &&
        item.payUrl
    ) ??
    channels[0];

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24
      }}
    >
      <Card style={{ width: "min(1080px, 100%)" }}>
        <Space
          direction="vertical"
          size={24}
          style={{ width: "100%" }}
        >
          {error ? (
            <Alert
              type="warning"
              showIcon
              message="收银台接口尚未连通，当前展示回退占位数据"
              description={error}
            />
          ) : null}

          <div>
            <Typography.Title level={2} style={{ marginTop: 0, marginBottom: 8 }}>
              统一收银台
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              这是第一阶段收银台骨架页面，后续会接真实二维码、轮询状态和渠道拉起。
            </Typography.Paragraph>
          </div>

          <Steps
            current={1}
            items={[
              { title: "订单创建" },
              { title: "收银台展示" },
              { title: "扫码支付" },
              { title: "结果回调" }
            ]}
          />

          <Row gutter={[24, 24]}>
            <Col xs={24} lg={14}>
              <div className="cashier-qr">
                {orderInfo.status === "SUCCESS" ? (
                  <Result
                    status="success"
                    title="支付成功"
                    subTitle="平台已确认支付成功，后续会继续处理商户通知。"
                  />
                ) : orderInfo.status === "CLOSED" || orderInfo.status === "EXPIRED" ? (
                  <Result
                    status="warning"
                    title="订单已关闭"
                    subTitle={`当前订单状态为 ${orderInfo.status}，不会再继续创建新的支付会话。`}
                  />
                ) : primaryChannel?.actionType === "QR_CODE" && primaryChannel.qrContent ? (
                  <Space
                    direction="vertical"
                    size={16}
                    style={{ width: "100%", alignItems: "center" }}
                  >
                    <Typography.Title level={4} style={{ marginBottom: 0 }}>
                      扫码支付
                    </Typography.Title>
                    <QRCode value={primaryChannel.qrContent} size={240} />
                    <Typography.Text type="secondary">
                      当前通道：{primaryChannel.displayName}
                    </Typography.Text>
                    <Button type="primary" onClick={() => setReloadKey((value) => value + 1)}>
                      刷新支付会话
                    </Button>
                  </Space>
                ) : primaryChannel?.actionType === "REDIRECT_URL" &&
                  primaryChannel.payUrl ? (
                  <Result
                    status="info"
                    title="拉起支付宝支付"
                    subTitle="当前通道返回的是跳转链接，适合移动端 H5 / WAP 场景。"
                    extra={[
                      <Button
                        key="open"
                        type="primary"
                        href={primaryChannel.payUrl}
                        target="_blank"
                      >
                        打开支付宝
                      </Button>,
                      <Button
                        key="refresh"
                        onClick={() => setReloadKey((value) => value + 1)}
                      >
                        刷新支付会话
                      </Button>
                    ]}
                  />
                ) : (
                  <Result
                    status="info"
                    title="支付会话准备中"
                    subTitle="当前渠道还没有返回可扫码二维码或跳转链接。"
                    extra={
                      <Button type="primary" onClick={() => setReloadKey((value) => value + 1)}>
                        刷新支付会话
                      </Button>
                    }
                  />
                )}
              </div>
            </Col>
            <Col xs={24} lg={10}>
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                <Card size="small" title="订单信息">
                  <Descriptions
                    column={1}
                    items={[
                      {
                        key: "platformOrderNo",
                        label: "平台单号",
                        children: orderInfo.platformOrderNo
                      },
                      {
                        key: "amount",
                        label: "金额",
                        children: `${orderInfo.amount / 100} ${orderInfo.currency}`
                      },
                      {
                        key: "expireTime",
                        label: "有效期",
                        children: orderInfo.expireTime
                      },
                      {
                        key: "status",
                        label: "订单状态",
                        children: orderInfo.status
                      }
                    ]}
                  />
                </Card>

                <Card size="small" title="支付方式">
                  <Space direction="vertical" style={{ width: "100%" }} size={12}>
                    {channels.map((item) => (
                      <Card size="small" key={item.channel}>
                        <Space direction="vertical" size={8} style={{ width: "100%" }}>
                          <Space wrap>
                            <Tag color={item.enabled ? "processing" : "default"}>
                              {item.displayName}
                            </Tag>
                            <Tag>{item.integrationMode}</Tag>
                            <Tag
                              color={
                                item.sessionStatus === "READY"
                                  ? "green"
                                  : item.sessionStatus === "FAILED"
                                    ? "red"
                                    : "gold"
                              }
                            >
                              {item.sessionStatus}
                            </Tag>
                          </Space>
                          <Typography.Text type="secondary">
                            {item.note}
                          </Typography.Text>
                          {item.actionType === "QR_CODE" && item.qrContent ? (
                            <Typography.Text>已生成二维码，可直接扫码。</Typography.Text>
                          ) : null}
                          {item.actionType === "REDIRECT_URL" && item.payUrl ? (
                            <Button href={item.payUrl} target="_blank">
                              打开 {item.displayName}
                            </Button>
                          ) : null}
                        </Space>
                      </Card>
                    ))}
                  </Space>
                </Card>

                <Card size="small" title="后续动作">
                  <Typography.Paragraph style={{ marginBottom: 12 }}>
                    下一阶段会把渠道预下单、支付状态轮询、支付成功页和商户回跳一起接进来。
                  </Typography.Paragraph>
                  <Button>
                    <Link to="/dashboard">返回后台骨架</Link>
                  </Button>
                </Card>
              </Space>
            </Col>
          </Row>
        </Space>
      </Card>
    </div>
  );
}
