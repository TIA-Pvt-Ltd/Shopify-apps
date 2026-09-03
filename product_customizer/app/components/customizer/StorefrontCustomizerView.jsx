import { useLoaderData } from "react-router";
import CustomizerApp from "./CustomizerApp.jsx";
import customizerStyles from "../../styles/customizer.css?url";
import "../../styles/customizer.css";

export const links = () => [{ rel: "stylesheet", href: customizerStyles }];

function serializeBootstrap(data) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function CustomizerPage({ data }) {
  if (data?.error || !data?.customizer) {
    return (
      <div className="customizer-error">
        {data?.error || "Unable to load product configuration."}
      </div>
    );
  }

  return (
    <CustomizerApp
      shop={data.shop}
      appUrl={data.appUrl}
      customizer={data.customizer}
      product={data.product}
      assets={data.assets}
      fonts={data.fonts}
      apiBase={data.apiBase || `${data.appUrl}/api/storefront`}
    />
  );
}

export function StorefrontCustomizerView() {
  const data = useLoaderData();

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `window.__CUSTOMIZER_BOOTSTRAP__=${serializeBootstrap(data)};`,
        }}
      />
      <div id="customizer-root">
        <CustomizerPage data={data} />
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html:
            'if(window.parent!==window)window.parent.postMessage({source:"product-customizer",type:"READY"},"*");',
        }}
      />
    </>
  );
}
