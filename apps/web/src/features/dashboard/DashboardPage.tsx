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
} from "antd";
import { fetchAdminJson } from "../admin/admin-api";
import { getApiBaseUrl } from "../../config/runtime-config";

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

function formatDateTime(value: string): string {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN");
}

export function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<Record<string, string> | null>(null);
  const [dashboard, setDashboard] = useState<DashboardState | null>(null);
  const apiBaseUrl = getApiBaseUrl();

  useEffect(() => {
    async function load() {
      try {
        const [healthResponse, summaryData] = await Promise.all([
          fetch(`${apiBaseUrl}/health`),
          fetchAdminJson<DashboardState>("/admin/summary")
        ]);
        const healthJson = (await healthResponse.json()) as {
          data: Record<string, string>;
        };

        setHealth(healthJson.data);
        setDashboard(summaryData);
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
              scroll={{ x: 860 }}
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
                  width: 260,
                  ellipsis: true
                },
                { title: "金额(分)", dataIndex: "amount", width: 110 },
                { title: "状态", dataIndex: "status", width: 140, ellipsis: true },
                {
                  title: "创建时间",
                  dataIndex: "createdAt",
                  width: 180,
                  render: (value: string) => formatDateTime(value)
                }
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
              scroll={{ x: 720 }}
              columns={[
                {
                  title: "退款单号",
                  dataIndex: "merchantRefundNo",
                  width: 240,
                  ellipsis: true
                },
                {
                  title: "支付单号",
                  dataIndex: "platformOrderNo",
                  width: 220,
                  ellipsis: true
                },
                { title: "退款金额(分)", dataIndex: "refundAmount", width: 120 },
                { title: "状态", dataIndex: "status", width: 120, ellipsis: true }
              ]}
            />
          </Card>
        </Col>
      </Row>
    </>
  );
}
