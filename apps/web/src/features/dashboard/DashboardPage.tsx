import { useEffect, useState } from "react";
import {
  Alert,
  Card,
  Col,
  Descriptions,
  Row,
  Skeleton,
  Statistic,
  Table,
  Typography
} from "antd";

interface DashboardState {
  metrics: Array<{ key: string; label: string; value: number }>;
  latestOrders: Array<{
    platformOrderNo: string;
    merchantOrderNo: string;
    amount: number;
    status: string;
    createdAt: string;
  }>;
  latestRefunds: Array<{
    merchantRefundNo: string;
    platformOrderNo: string;
    refundAmount: number;
    status: string;
    createdAt: string;
  }>;
  paymentProviders: Array<{
    providerCode: string;
    displayName: string;
    integrationMode: string;
    supportedChannels: string[];
    officialSdkPackage?: string;
    enabled: boolean;
    note: string;
  }>;
}

export function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<Record<string, string> | null>(null);
  const [dashboard, setDashboard] = useState<DashboardState | null>(null);
  const apiBaseUrl =
    import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";

  useEffect(() => {
    async function load() {
      try {
        const [healthResponse, summaryResponse] = await Promise.all([
          fetch(`${apiBaseUrl}/health`),
          fetch(`${apiBaseUrl}/admin/summary`)
        ]);
        const healthJson = (await healthResponse.json()) as {
          data: Record<string, string>;
        };
        const summaryJson = (await summaryResponse.json()) as {
          data: DashboardState;
        };

        setHealth(healthJson.data);
        setDashboard(summaryJson.data);
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "Failed to load dashboard"
        );
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [apiBaseUrl]);

  return (
    <>
      {error ? (
        <Alert
          className="page-card"
          type="error"
          showIcon
          message="API 连接失败"
          description={error}
        />
      ) : null}

      <Card className="page-card">
        {loading ? (
          <Skeleton active />
        ) : (
          <Descriptions
            title="API 健康状态"
            column={{ xs: 1, md: 2 }}
            items={[
              { key: "status", label: "状态", children: health?.status ?? "-" },
              { key: "service", label: "服务名", children: health?.service ?? "-" },
              { key: "version", label: "版本", children: health?.version ?? "-" },
              {
                key: "timestamp",
                label: "时间",
                children: health?.timestamp ?? "-"
              }
            ]}
          />
        )}
      </Card>

      <Row gutter={[16, 16]} className="page-card">
        {(dashboard?.metrics ?? []).map((metric) => (
          <Col xs={24} sm={12} xl={6} key={metric.key}>
            <Card>
              <Statistic title={metric.label} value={metric.value} />
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]} className="page-card">
        <Col xs={24} xl={14}>
          <Card title="最新订单">
            <Table
              rowKey="platformOrderNo"
              pagination={false}
              dataSource={dashboard?.latestOrders ?? []}
              columns={[
                { title: "平台单号", dataIndex: "platformOrderNo" },
                { title: "商户单号", dataIndex: "merchantOrderNo" },
                { title: "金额(分)", dataIndex: "amount" },
                { title: "状态", dataIndex: "status" },
                { title: "创建时间", dataIndex: "createdAt" }
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card title="最新退款">
            <Table
              rowKey="merchantRefundNo"
              pagination={false}
              dataSource={dashboard?.latestRefunds ?? []}
              columns={[
                { title: "退款单号", dataIndex: "merchantRefundNo" },
                { title: "支付单号", dataIndex: "platformOrderNo" },
                { title: "退款金额(分)", dataIndex: "refundAmount" },
                { title: "状态", dataIndex: "status" }
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Card className="page-card" title="支付渠道抽象层">
        <Table
          rowKey="providerCode"
          pagination={false}
          dataSource={dashboard?.paymentProviders ?? []}
          columns={[
            { title: "平台", dataIndex: "displayName" },
            { title: "Provider Code", dataIndex: "providerCode" },
            { title: "接入策略", dataIndex: "integrationMode" },
            {
              title: "官方 SDK",
              dataIndex: "officialSdkPackage",
              render: (value?: string) => value ?? "-"
            },
            {
              title: "支持渠道",
              dataIndex: "supportedChannels",
              render: (value: string[]) => value.join(", ")
            },
            {
              title: "是否已配置",
              dataIndex: "enabled",
              render: (value: boolean) => (value ? "是" : "否")
            }
          ]}
        />
      </Card>
    </>
  );
}
