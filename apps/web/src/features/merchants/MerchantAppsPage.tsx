import { Alert, Card, Space, Table, Tag, Typography } from "antd";
import { useEffect, useState } from "react";

export function MerchantAppsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<
    Array<{
      appId: string;
      appName: string;
      status: string;
      signType: string;
      allowedChannels: string[];
    }>
  >([]);

  useEffect(() => {
    const apiBaseUrl =
      import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";

    async function loadMerchantApps() {
      try {
        const response = await fetch(`${apiBaseUrl}/admin/merchants`);
        const json = (await response.json()) as {
          data: Array<{
            appId: string;
            appName: string;
            status: string;
            signType: string;
            allowedChannels: string[];
          }>;
        };

        setData(json.data);
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "Failed to load merchant apps"
        );
      } finally {
        setLoading(false);
      }
    }

    void loadMerchantApps();
  }, []);

  return (
    <Card className="page-card">
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <div>
          <Typography.Title level={3} style={{ marginTop: 0 }}>
            商户应用
          </Typography.Title>
        </div>
        {error ? (
          <Alert type="error" showIcon message="商户应用加载失败" description={error} />
        ) : null}
        <Table
          rowKey="appId"
          dataSource={data}
          loading={loading}
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
