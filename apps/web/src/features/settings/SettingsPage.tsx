import { useEffect, useState } from "react";
import {
  Card,
  Col,
  Form,
  Input,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography
} from "antd";

export function SettingsPage() {
  const [providers, setProviders] = useState<
    Array<{
      providerCode: string;
      displayName: string;
      integrationMode: string;
      officialSdkPackage?: string;
      enabled: boolean;
    }>
  >([]);

  useEffect(() => {
    const apiBaseUrl =
      import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";

    async function loadProviders() {
      try {
        const response = await fetch(`${apiBaseUrl}/admin/channels`);
        const json = (await response.json()) as {
          data: Array<{
            providerCode: string;
            displayName: string;
            integrationMode: string;
            officialSdkPackage?: string;
            enabled: boolean;
          }>;
        };

        setProviders(json.data);
      } catch {
        setProviders([]);
      }
    }

    void loadProviders();
  }, []);

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
      <Card title="渠道接入策略">
        <Table
          rowKey="providerCode"
          pagination={false}
          dataSource={providers}
          columns={[
            { title: "平台", dataIndex: "displayName" },
            {
              title: "策略",
              dataIndex: "integrationMode",
              render: (value: string) => (
                <Tag color={value === "OFFICIAL_NODE_SDK" ? "processing" : "gold"}>
                  {value}
                </Tag>
              )
            },
            {
              title: "官方 SDK 包",
              dataIndex: "officialSdkPackage",
              render: (value?: string) => value ?? "无，走 API"
            },
            {
              title: "配置状态",
              dataIndex: "enabled",
              render: (value: boolean) => (
                <Tag color={value ? "green" : "default"}>
                  {value ? "已配置" : "待配置"}
                </Tag>
              )
            }
          ]}
        />
      </Card>
    </Space>
  );
}
