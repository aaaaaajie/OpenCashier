import {
  Alert,
  Button,
  Card,
  Space,
  Table,
  Tag,
  Typography,
  message
} from "antd";
import { useCallback, useEffect, useState } from "react";

const statusColorMap: Record<string, string> = {
  SUCCESS: "green",
  RETRYING: "gold",
  PENDING: "blue",
  DEAD: "red"
};

interface NotificationTask {
  notifyId: string;
  businessType: string;
  businessNo: string;
  eventType: string;
  appId: string | null;
  notifyUrl: string;
  status: string;
  retryCount: number;
  nextRetryTime: string | null;
  lastHttpCode: number | null;
  lastResponse: string | null;
  updatedAt: string;
  createdAt: string;
}

export function NotificationsPage() {
  const [messageApi, contextHolder] = message.useMessage();
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<NotificationTask[]>([]);
  const apiBaseUrl =
    import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";

  const loadTasks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${apiBaseUrl}/admin/notifications`);
      const json = (await response.json()) as { data: NotificationTask[] };

      setData(json.data);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Failed to load notify tasks"
      );
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  async function retryTask(notifyId: string) {
    try {
      setRetryingId(notifyId);

      const response = await fetch(
        `${apiBaseUrl}/admin/notifications/${notifyId}/retry`,
        {
          method: "POST"
        }
      );

      if (!response.ok) {
        throw new Error(`Retry request failed with status ${response.status}`);
      }

      messageApi.success("通知任务已重新投递");
      await loadTasks();
    } catch (caught) {
      messageApi.error(
        caught instanceof Error ? caught.message : "通知任务补发失败"
      );
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <Card className="page-card">
      {contextHolder}
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <div>
          <Typography.Title level={3} style={{ marginTop: 0 }}>
            通知任务
          </Typography.Title>
        </div>
        {error ? (
          <Alert type="error" showIcon message="通知任务加载失败" description={error} />
        ) : null}
        <Table
          rowKey="notifyId"
          dataSource={data}
          loading={loading}
          columns={[
            { title: "通知 ID", dataIndex: "notifyId" },
            { title: "事件类型", dataIndex: "eventType" },
            { title: "业务类型", dataIndex: "businessType" },
            { title: "业务单号", dataIndex: "businessNo" },
            {
              title: "应用",
              dataIndex: "appId",
              render: (value: string | null) => value ?? "-"
            },
            {
              title: "状态",
              dataIndex: "status",
              render: (value: string) => (
                <Tag color={statusColorMap[value] ?? "default"}>{value}</Tag>
              )
            },
            { title: "重试次数", dataIndex: "retryCount" },
            {
              title: "下次重试时间",
              dataIndex: "nextRetryTime",
              render: (value: string | null) => value ?? "-"
            },
            {
              title: "最近响应",
              render: (_value: unknown, record: NotificationTask) => {
                if (!record.lastResponse) {
                  return record.lastHttpCode ?? "-";
                }

                return `${record.lastHttpCode ?? "-"} / ${record.lastResponse}`;
              }
            },
            {
              title: "操作",
              dataIndex: "notifyId",
              render: (value: string) => (
                <Button
                  size="small"
                  loading={retryingId === value}
                  onClick={() => void retryTask(value)}
                >
                  重新投递
                </Button>
              )
            }
          ]}
        />
      </Space>
    </Card>
  );
}
