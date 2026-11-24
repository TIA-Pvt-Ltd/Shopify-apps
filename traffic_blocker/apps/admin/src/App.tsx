import { useState } from "react";
import { Frame, Navigation, Toast } from "@shopify/polaris";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { OverviewPage } from "./pages/Overview";
import { CountriesPage } from "./pages/Countries";
import { IpPage } from "./pages/Ip";
import { AsnPage } from "./pages/Asn";
import { BotsPage } from "./pages/Bots";
import { AnalyticsPage } from "./pages/Overview";
import { RulesPage } from "./pages/Rules";
import { EventsPage } from "./pages/Events";
import { BlockedPageEditor } from "./pages/BlockedPage";
import { NotificationsPage } from "./pages/Notifications";
import { EdgePage } from "./pages/Edge";
import { BillingPage } from "./pages/Billing";
import { SettingsPage } from "./pages/Settings";

const SECTIONS: Array<{ title: string; items: Array<readonly [string, string]> }> = [
  {
    title: "Monitor",
    items: [
      ["/", "Overview"],
      ["/analytics", "Traffic analytics"],
      ["/events", "Blocked visitors"],
    ],
  },
  {
    title: "Protection",
    items: [
      ["/countries", "Countries"],
      ["/ips", "IP addresses"],
      ["/asns", "Networks"],
      ["/bots", "Bots and VPN"],
      ["/rules", "Custom rules"],
    ],
  },
  {
    title: "Storefront",
    items: [
      ["/blocked-page", "Restriction page"],
      ["/notifications", "Notifications"],
      ["/integrations", "Edge integration"],
    ],
  },
  {
    title: "Account",
    items: [
      ["/billing", "Billing"],
      ["/settings", "Settings"],
    ],
  },
];

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [toast, setToast] = useState<string | null>(null);
  const search = location.search;
  return (
    <Frame
      navigation={
        <Navigation
          location={location.pathname + search}
          contextControl={
            <button type="button" className="tb-brand" onClick={() => navigate("/" + search)}>
              <span className="tb-mark" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18">
                  <path fill="currentColor" d="M12 2.5 4.5 6v6.2c0 4.4 3.1 8.5 7.5 9.3 4.4-.8 7.5-4.9 7.5-9.3V6L12 2.5Zm0 2.2 5.5 2.6v5c0 3.3-2.2 6.4-5.5 7.1-3.3-.7-5.5-3.8-5.5-7.1v-5L12 4.7Zm-1 4.3v2.2H8.8V13H11v2.2h2V13h2.2v-1.8H13V9h-2Z" />
                </svg>
              </span>
              <span className="tb-brand-copy">
                <strong>Traffic Blocker</strong>
                <small>Storefront access control</small>
              </span>
            </button>
          }
        >
          {SECTIONS.map((section) => (
            <Navigation.Section
              key={section.title}
              title={section.title}
              items={section.items.map(([url, label]) => ({
                label,
                url: url + search,
                exactMatch: true,
                selected: location.pathname === url,
              }))}
            />
          ))}
        </Navigation>
      }
    >
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
          <Route path="/notifications" element={<NotificationsPage notify={setToast} />} />
          <Route path="/integrations" element={<EdgePage notify={setToast} />} />
          <Route path="/billing" element={<BillingPage notify={setToast} />} />
          <Route path="/settings" element={<SettingsPage notify={setToast} />} />
          <Route path="*" element={<Navigate to={"/" + search} replace />} />
        </Routes>
      </div>
      {toast ? <Toast content={toast} onDismiss={() => setToast(null)} /> : null}
    </Frame>
  );
}
