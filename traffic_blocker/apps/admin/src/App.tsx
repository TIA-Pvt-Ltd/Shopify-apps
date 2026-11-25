import { useState } from "react";
import { Frame, Toast } from "@shopify/polaris";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { OverviewPage } from "./pages/Overview";
import { CountriesPage } from "./pages/Countries";
import { IpPage } from "./pages/Ip";
import { AsnPage } from "./pages/Asn";
import { BotsPage } from "./pages/Bots";
import { AnalyticsPage } from "./pages/Overview";
import { RulesPage } from "./pages/Rules";
import { EventsPage } from "./pages/Events";
import { BlockedPageEditor } from "./pages/BlockedPage";
import { BillingPage } from "./pages/Billing";
import { SettingsPage } from "./pages/Settings";

export function App() {
  const location = useLocation();
  const [toast, setToast] = useState<string | null>(null);
  const search = location.search;

  return (
    <Frame>
      <div className="tb-canvas">
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/countries" element={<CountriesPage notify={setToast} />} />
          <Route path="/ips" element={<IpPage notify={setToast} />} />
          <Route path="/asns" element={<AsnPage notify={setToast} />} />
          <Route path="/bots" element={<BotsPage notify={setToast} />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/rules" element={<RulesPage notify={setToast} />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/blocked-page" element={<BlockedPageEditor notify={setToast} />} />
          <Route path="/billing" element={<BillingPage notify={setToast} />} />
          <Route path="/settings" element={<SettingsPage notify={setToast} />} />
          <Route path="*" element={<Navigate to={"/" + search} replace />} />
        </Routes>
      </div>
      {toast ? <Toast content={toast} onDismiss={() => setToast(null)} /> : null}
    </Frame>
  );
}
