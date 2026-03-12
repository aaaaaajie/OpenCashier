import { Card, Space, Table, Tag, Typography } from "antd";

const data = [
  {
    appId: "demo_app",
    appName: "演示商户应用",
    status: "ACTIVE",
    signType: "HMAC-SHA256",
    allowedChannels: ["wechat_qr", "alipay_qr"]
  },
  {
    appId: "partner_app",
    appName: "渠道联调应用",
    status: "ACTIVE",
    signType: "RSA2",
    allowedChannels: ["wechat_qr"]
  }
];

export function MerchantAppsPage() {
  return (
    <Card className="page-card">
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <div>
          <Typography.Title level={3} style={{ marginTop: 0 }}>
            商户应用
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            第一阶段先提供接入配置骨架，后续再补充密钥轮换、回调白名单和权限管理。
          </Typography.Paragraph>
        </div>
        <Table
          rowKey="appId"
          dataSource={data}
          columns={[
            { title: "App ID", dataIndex: "appId" },
            { title: "应用名称", dataIndex: "appName" },
            {
              title: "状态",
              dataIndex: "status",
              render: (value: string) => <Tag color="green">{value}</Tag>
            },
            { title: "签名方式", dataIndex: "signType" },
            {
              title: "支付方式",
              dataIndex: "allowedChannels",
              render: (value: string[]) => (
                <Space wrap>
                  {value.map((item) => (
                    <Tag key={item}>{item}</Tag>
                  ))}
                </Space>
              )
            }
          ]}
        />
      </Space>
    </Card>
  );
}

