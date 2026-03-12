import {
  Button,
  Card,
  Col,
  Descriptions,
  Row,
  Result,
  Space,
  Steps,
  Tag,
  Typography
} from "antd";
import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";

export function CashierPage() {
  const { cashierToken } = useParams();
  const orderInfo = useMemo(
    () => ({
      platformOrderNo: cashierToken ?? "P202603120001",
      amount: 9900,
      currency: "CNY",
      expireTime: "15 分钟后过期",
      channels: ["wechat_qr", "alipay_qr"]
    }),
    [cashierToken]
  );

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
                <Result
                  status="info"
                  title="二维码占位区域"
                  subTitle="后续接微信 / 支付宝预下单结果，并在这里展示真实二维码或跳转链接。"
                  extra={<Button type="primary">刷新支付会话</Button>}
                />
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
                      }
                    ]}
                  />
                </Card>

                <Card size="small" title="支付方式">
                  <Space wrap>
                    {orderInfo.channels.map((item) => (
                      <Tag color="processing" key={item}>
                        {item}
                      </Tag>
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
