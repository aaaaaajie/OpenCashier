import { Card, Col, Form, Input, Row, Select, Space, Typography } from "antd";

export function SettingsPage() {
  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card className="page-card">
        <Typography.Title level={3} style={{ marginTop: 0 }}>
          系统设置
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          这里先作为平台配置骨架，后续再扩展默认超时、签名方式、通知退避策略和渠道参数。
        </Typography.Paragraph>
      </Card>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="支付默认配置">
            <Form layout="vertical">
              <Form.Item label="默认订单超时">
                <Input value="900 秒" readOnly />
              </Form.Item>
              <Form.Item label="默认币种">
                <Input value="CNY" readOnly />
              </Form.Item>
              <Form.Item label="默认签名方式">
                <Select
                  value="HMAC-SHA256"
                  options={[
                    { value: "HMAC-SHA256", label: "HMAC-SHA256" },
                    { value: "RSA2", label: "RSA2" }
                  ]}
                />
              </Form.Item>
            </Form>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="通知退避策略">
            <Form layout="vertical">
              <Form.Item label="重试间隔">
                <Input value="1m / 5m / 15m / 30m / 1h / 6h" readOnly />
              </Form.Item>
              <Form.Item label="死信阈值">
                <Input value="6 次" readOnly />
              </Form.Item>
              <Form.Item label="预留配置">
                <Input.TextArea
                  rows={5}
                  value="下一阶段补充渠道、风控、自动退款等平台级配置。"
                  readOnly
                />
              </Form.Item>
            </Form>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}

