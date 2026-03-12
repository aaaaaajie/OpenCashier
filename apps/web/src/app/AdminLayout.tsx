import {
  DashboardOutlined,
  NotificationOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  ShoppingCartOutlined
} from "@ant-design/icons";
import {
  Breadcrumb,
  Layout,
  Menu,
  Space,
  Tag,
  Typography
} from "antd";
import { Link, Outlet, useLocation } from "react-router-dom";

const { Header, Sider, Content } = Layout;

const menuItems = [
  {
    key: "/dashboard",
    icon: <DashboardOutlined />,
    label: <Link to="/dashboard">总览</Link>
  },
  {
    key: "/merchants",
    icon: <SafetyCertificateOutlined />,
    label: <Link to="/merchants">商户应用</Link>
  },
  {
    key: "/orders",
    icon: <ShoppingCartOutlined />,
    label: <Link to="/orders">支付订单</Link>
  },
  {
    key: "/refunds",
    icon: <ReloadOutlined />,
    label: <Link to="/refunds">退款单</Link>
  },
  {
    key: "/notifications",
    icon: <NotificationOutlined />,
    label: <Link to="/notifications">通知任务</Link>
  },
  {
    key: "/settings",
    icon: <SettingOutlined />,
    label: <Link to="/settings">系统设置</Link>
  }
];

const breadcrumbTitleMap: Record<string, string> = {
  "/dashboard": "总览",
  "/merchants": "商户应用",
  "/orders": "支付订单",
  "/refunds": "退款单",
  "/notifications": "通知任务",
  "/settings": "系统设置"
};

export function AdminLayout() {
  const location = useLocation();

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider
        breakpoint="lg"
        collapsedWidth={72}
        width={240}
        style={{
          background: "#0f172a"
        }}
      >
        <div style={{ padding: 20, color: "#fff" }}>
          <Typography.Title
            level={4}
            style={{ color: "#fff", margin: 0, fontSize: 18 }}
          >
            统一收银台
          </Typography.Title>
          <Typography.Text style={{ color: "rgba(255,255,255,0.72)" }}>
            Phase 1 Scaffold
          </Typography.Text>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "rgba(255,255,255,0.8)",
            backdropFilter: "blur(12px)",
            borderBottom: "1px solid rgba(15,23,42,0.08)"
          }}
        >
          <Space direction="vertical" size={0}>
            <Typography.Text strong>统一收银台后台</Typography.Text>
            <Breadcrumb
              items={[
                { title: "Payment Platform" },
                {
                  title:
                    breadcrumbTitleMap[location.pathname] ?? "总览"
                }
              ]}
            />
          </Space>
          <Space>
            <Tag color="processing">NestJS + Prisma</Tag>
            <Tag color="success">React + Ant Design</Tag>
          </Space>
        </Header>
        <Content style={{ padding: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
