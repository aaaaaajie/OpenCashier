import { ConfigProvider, theme } from "antd";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes
} from "react-router-dom";
import { AdminLayout } from "./AdminLayout";
import { CashierPage } from "../features/cashier/CashierPage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { MerchantAppsPage } from "../features/merchants/MerchantAppsPage";
import { NotificationsPage } from "../features/notifications/NotificationsPage";
import { OrdersPage } from "../features/orders/OrdersPage";
import { RefundsPage } from "../features/refunds/RefundsPage";
import { SettingsPage } from "../features/settings/SettingsPage";

export function App() {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: "#1677ff",
          borderRadius: 12
        }
      }}
    >
      <BrowserRouter>
        <Routes>
          <Route path="/cashier/:cashierToken" element={<CashierPage />} />
          <Route path="/" element={<AdminLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="merchants" element={<MerchantAppsPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="refunds" element={<RefundsPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}

