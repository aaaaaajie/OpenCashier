import { Button, Card, Space, Table, Tag, Typography } from "antd";

const data = [
  {
    platformOrderNo: "P202603120001",
    merchantOrderNo: "ORDER_10001",
    amount: 9900,
    channel: "wechat_qr",
    status: "SUCCESS",
    createdAt: "2026-03-12T16:33:21+08:00"
  },
  {
    platformOrderNo: "P202603120002",
    merchantOrderNo: "ORDER_10002",
    amount: 19900,
    channel: "alipay_qr",
    status: "WAIT_PAY",
    createdAt: "2026-03-12T16:40:00+08:00"
  }
];

export function OrdersPage() {
  return (
    <Card className="page-card">
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div>
            <Typography.Title level={3} style={{ marginTop: 0 }}>
              支付订单
            </Typography.Title>
          </div>
          <Button type="primary">创建测试订单</Button>
        </div>
        <Table
          rowKey="platformOrderNo"
          dataSource={data}
          columns={[
            { title: "平台单号", dataIndex: "platformOrderNo" },
            { title: "商户单号", dataIndex: "merchantOrderNo" },
            { title: "金额(分)", dataIndex: "amount" },
            { title: "渠道", dataIndex: "channel" },
            {
              title: "状态",
              dataIndex: "status",
              render: (value: string) => (
                <Tag color={value === "SUCCESS" ? "green" : "blue"}>{value}</Tag>
              )
            },
            { title: "创建时间", dataIndex: "createdAt" }
          ]}
        />
      </Space>
    </Card>
  );
}

