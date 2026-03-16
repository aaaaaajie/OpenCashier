import { Alert, Button, Card, Space, Table, Tag, Typography } from "antd";
import { useCallback, useEffect, useState } from "react";

const statusColorMap: Record<string, string> = {
  WAIT_PAY: "blue",
  PAYING: "processing",
  SUCCESS: "green",
  CLOSED: "default",
  EXPIRED: "orange",
  REFUND_PART: "gold",
  REFUND_ALL: "purple"
};

interface OrderRecord {
  appId: string;
  platformOrderNo: string;
  merchantOrderNo: string;
  amount: number;
  paidAmount: number;
  currency: string;
  subject: string;
  description?: string;
  status: string;
  channel: string | null;
  notifyUrl: string;
  returnUrl?: string;
  expireTime: string;
  createdAt: string;
  paidTime?: string | null;
  allowedChannels: string[];
  metadata?: Record<string, unknown>;
  cashierUrl: string;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN");
}

export function OrdersPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OrderRecord[]>([]);
  const apiBaseUrl =
    import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${apiBaseUrl}/admin/orders`);

      if (!response.ok) {
        throw new Error(`Order list request failed with status ${response.status}`);
      }

      const json = (await response.json()) as { data: OrderRecord[] };
      setData(json.data);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Failed to load pay orders"
      );
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  return (
    <Card className="page-card">
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div>
            <Typography.Title level={3} style={{ marginTop: 0 }}>
              支付订单
            </Typography.Title>
          </div>
        </div>
        {error ? (
          <Alert type="error" showIcon message="支付订单加载失败" description={error} />
        ) : null}
        <Table
          rowKey="platformOrderNo"
          loading={loading}
          dataSource={data}
          scroll={{ x: 1180 }}
          columns={[
            {
              title: "平台单号",
              dataIndex: "platformOrderNo",
              width: 240,
              ellipsis: true
            },
            {
              title: "商户单号",
              dataIndex: "merchantOrderNo",
              width: 220,
              ellipsis: true
            },
            { title: "应用", dataIndex: "appId", width: 120, ellipsis: true },
            { title: "金额(分)", dataIndex: "amount", width: 120 },
            {
              title: "渠道",
              dataIndex: "channel",
              width: 140,
              render: (value: string | null) => value ?? "-"
            },
            {
              title: "状态",
              dataIndex: "status",
              width: 140,
              render: (value: string) => (
                <Tag color={statusColorMap[value] ?? "default"}>{value}</Tag>
              )
            },
            {
              title: "创建时间",
              dataIndex: "createdAt",
              width: 180,
              render: (value: string) => formatDateTime(value)
            }
          ]}
        />
      </Space>
    </Card>
  );
}
