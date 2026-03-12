import { Card, Table, Tag, Typography } from "antd";

const data = [
  {
    merchantRefundNo: "REFUND_10001",
    platformOrderNo: "P202603120001",
    refundAmount: 3000,
    status: "SUCCESS",
    reason: "用户取消"
  }
];

export function RefundsPage() {
  return (
    <Card className="page-card">
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        退款单
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        一期先具备列表和状态承载能力，后续接真实退款查询和多次部分退款规则。
      </Typography.Paragraph>
      <Table
        rowKey="merchantRefundNo"
        dataSource={data}
        columns={[
          { title: "退款单号", dataIndex: "merchantRefundNo" },
          { title: "平台订单号", dataIndex: "platformOrderNo" },
          { title: "退款金额(分)", dataIndex: "refundAmount" },
          {
            title: "状态",
            dataIndex: "status",
            render: (value: string) => <Tag color="green">{value}</Tag>
          },
          { title: "原因", dataIndex: "reason" }
        ]}
      />
    </Card>
  );
}

