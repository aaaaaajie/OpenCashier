import { Alert, Card, Space, Table, Tag, Typography } from "antd";
import { useCallback, useEffect, useState } from "react";
import { getApiBaseUrl } from "../../config/runtime-config";

const statusColorMap: Record<string, string> = {
  CREATED: "default",
  PROCESSING: "processing",
  SUCCESS: "green",
  FAILED: "red",
  CLOSED: "default"
};

interface RefundRecord {
  appId: string;
  merchantRefundNo: string;
  platformRefundNo: string;
  platformOrderNo: string;
  refundAmount: number;
  status: string;
  reason: string;
  createdAt: string;
  successTime: string | null;
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN");
}

export function RefundsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RefundRecord[]>([]);
  const apiBaseUrl = getApiBaseUrl();

  const loadRefunds = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${apiBaseUrl}/admin/refunds`);

      if (!response.ok) {
        throw new Error(`Refund list request failed with status ${response.status}`);
      }

      const json = (await response.json()) as { data: RefundRecord[] };
      setData(json.data);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Failed to load refund orders"
      );
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    void loadRefunds();
  }, [loadRefunds]);

  return (
    <Card className="page-card">
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Typography.Title level={3} style={{ marginTop: 0 }}>
          退款单
        </Typography.Title>
        {error ? (
          <Alert type="error" showIcon message="退款单加载失败" description={error} />
        ) : null}
        <Table
          rowKey="merchantRefundNo"
          loading={loading}
          dataSource={data}
          scroll={{ x: 1380 }}
          columns={[
            {
              title: "退款单号",
              dataIndex: "merchantRefundNo",
              width: 240,
              ellipsis: true
            },
            {
              title: "平台退款单号",
              dataIndex: "platformRefundNo",
              width: 240,
              ellipsis: true
            },
            {
              title: "平台订单号",
              dataIndex: "platformOrderNo",
              width: 240,
              ellipsis: true
            },
            { title: "应用", dataIndex: "appId", width: 120, ellipsis: true },
            { title: "退款金额(分)", dataIndex: "refundAmount", width: 120 },
            {
              title: "状态",
              dataIndex: "status",
              width: 120,
              render: (value: string) => (
                <Tag color={statusColorMap[value] ?? "default"}>{value}</Tag>
              )
            },
            { title: "原因", dataIndex: "reason", width: 220, ellipsis: true },
            {
              title: "创建时间",
              dataIndex: "createdAt",
              width: 180,
              render: (value: string) => formatDateTime(value)
            },
            {
              title: "成功时间",
              dataIndex: "successTime",
              width: 180,
              render: (value: string | null) => formatDateTime(value)
            }
          ]}
        />
      </Space>
    </Card>
  );
}
