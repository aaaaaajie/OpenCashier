import { Card, Space, Table, Tag, Typography } from "antd";

const data = [
  {
    notifyId: "N202603120001",
    businessType: "PAY_ORDER",
    businessNo: "P202603120001",
    status: "SUCCESS",
    retryCount: 0,
    nextRetryTime: "-"
  },
  {
    notifyId: "N202603120002",
    businessType: "REFUND_ORDER",
    businessNo: "REFUND_10001",
    status: "RETRYING",
    retryCount: 2,
    nextRetryTime: "2026-03-12T18:00:00+08:00"
  }
];

const statusColorMap: Record<string, string> = {
  SUCCESS: "green",
  RETRYING: "gold",
  PENDING: "blue",
  DEAD: "red"
};

export function NotificationsPage() {
  return (
    <Card className="page-card">
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <div>
          <Typography.Title level={3} style={{ marginTop: 0 }}>
            通知任务
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            用于承载商户回调重试、死信和人工补发入口，符合产品文档中的通知补偿思路。
          </Typography.Paragraph>
        </div>
        <Table
          rowKey="notifyId"
          dataSource={data}
          columns={[
            { title: "通知 ID", dataIndex: "notifyId" },
            { title: "业务类型", dataIndex: "businessType" },
            { title: "业务单号", dataIndex: "businessNo" },
            {
              title: "状态",
              dataIndex: "status",
              render: (value: string) => (
                <Tag color={statusColorMap[value] ?? "default"}>{value}</Tag>
              )
            },
            { title: "重试次数", dataIndex: "retryCount" },
            { title: "下次重试时间", dataIndex: "nextRetryTime" }
          ]}
        />
      </Space>
    </Card>
  );
}

