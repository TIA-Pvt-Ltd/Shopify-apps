import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppProvider } from "@shopify/polaris";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import en from "@shopify/polaris/locales/en.json";
import "@shopify/polaris/build/esm/styles.css";
import { App } from "./App";
import { RouterLink } from "./RouterLink";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProvider i18n={en} linkComponent={RouterLink}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </AppProvider>
  </StrictMode>,
);
