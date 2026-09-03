import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

startTransition(() => {
  const root = document.getElementById("customizer-root");
  const data = window.__CUSTOMIZER_BOOTSTRAP__;

  if (root && data) {
    import("./components/customizer/StorefrontCustomizerView.jsx").then(({ CustomizerPage }) => {
      hydrateRoot(
        root,
        <StrictMode>
          <CustomizerPage data={data} />
        </StrictMode>,
      );
    });
    return;
  }

  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
  );
});
