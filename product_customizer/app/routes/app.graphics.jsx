import { useEffect, useMemo, useRef, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getOrCreateStore } from "../services/store.server";
import { deleteAsset, listAssets } from "../services/asset.server";
import { handleAdminAssetUpload, getAppUrl } from "../services/storefront-api.server";
import { GRAPHIC_CATEGORIES } from "../utils/customizer-defaults";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  const assets = await listAssets(store.id, {
    types: ["graphic", "upload"],
    appUrl: getAppUrl(request),
  });
  return { assets };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const result = await handleAdminAssetUpload(store, request);
    return result.error
      ? { ok: false, error: result.error }
      : { ok: true, uploaded: true, asset: result.asset };
  }
  const formData = await request.formData();
  if (formData.get("intent") === "delete") {
    await deleteAsset(store.id, String(formData.get("id")));
    return { ok: true, deleted: true };
  }
  return { ok: false };
};

function fieldValue(root, selector) {
  const el = root?.querySelector(selector);
  return el?.value || "";
}

function selectedFile(root, stagedFile) {
  if (stagedFile instanceof File && stagedFile.size) return stagedFile;
  const dropZone = root?.querySelector("s-drop-zone");
  const fromDropZone = dropZone?.files?.[0];
  if (fromDropZone instanceof File && fromDropZone.size) return fromDropZone;
  const input = root?.querySelector('input[type="file"]');
  const fromInput = input?.files?.[0];
  if (fromInput instanceof File && fromInput.size) return fromInput;
  return null;
}

export default function GraphicsPage() {
  const { assets } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const formRef = useRef(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [stagedFile, setStagedFile] = useState(null);
  const uploading = fetcher.state !== "idle" && !fetcher.formData?.get("intent");

  useEffect(() => {
    if (fetcher.data?.uploaded) {
      shopify.toast.show("Graphic uploaded");
      formRef.current?.reset();
      setStagedFile(null);
    } else if (fetcher.data?.deleted) {
      shopify.toast.show("Graphic deleted");
    } else if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return assets.filter((asset) => {
      if (categoryFilter !== "all" && asset.category !== categoryFilter) return false;
      if (term && !String(asset.name || "").toLowerCase().includes(term)) return false;
      return true;
    });
  }, [assets, categoryFilter, query]);

  const heading = assets.length ? `Graphics (${assets.length})` : "Graphics";

  return (
    <s-page heading={heading}>
      <s-section heading="Upload a graphic">
        <s-paragraph color="subdued">
          Add logos and clip art customers can place on products. Use PNG, JPG, or SVG.
        </s-paragraph>
        <fetcher.Form
          method="post"
          encType="multipart/form-data"
          ref={formRef}
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const file = selectedFile(form, stagedFile);
            if (!file) {
              shopify.toast.show("Choose a PNG, JPG, or SVG file.", { isError: true });
              return;
            }
            const data = new FormData();
            data.append("type", "graphic");
            data.append("name", fieldValue(form, "s-text-field") || file.name.replace(/\.[^.]+$/, ""));
            data.append("category", fieldValue(form, "s-select") || "Other");
            data.append("file", file);
            fetcher.submit(data, { method: "post", encType: "multipart/form-data" });
          }}
        >
          <s-stack gap="base">
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              <s-text-field
                name="name"
                label="Name"
                placeholder="Summer logo"
                details="Leave blank to use the file name."
              />
              <s-select name="category" label="Category" defaultValue="Other">
                {GRAPHIC_CATEGORIES.map((category) => (
                  <s-option key={category} value={category}>
                    {category}
                  </s-option>
                ))}
              </s-select>
            </s-grid>
            <s-drop-zone
              name="file"
              label="Graphic file"
              accept=".png,.jpg,.jpeg,.svg"
              details={
                stagedFile
                  ? `Selected: ${stagedFile.name}`
                  : "PNG, JPG, or SVG. Transparent PNGs work best on product mockups."
              }
              onChange={(event) => setStagedFile(event.currentTarget.files?.[0] || null)}
            />
            <label className="admin-file-input">
              Or choose a file
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml"
                onChange={(event) => setStagedFile(event.currentTarget.files?.[0] || null)}
              />
            </label>
            <s-stack direction="inline" gap="small">
              <s-button type="submit" {...(uploading ? { loading: true } : {})}>
                Upload graphic
              </s-button>
            </s-stack>
          </s-stack>
        </fetcher.Form>
      </s-section>

      <s-section heading="Library" padding={assets.length ? "none" : "base"}>
        {assets.length ? (
          <>
            <s-box padding="base" paddingBlockEnd="none">
              <s-stack gap="small">
                <s-search-field
                  label="Search graphics"
                  labelAccessibilityVisibility="exclusive"
                  placeholder="Search graphics"
                  onInput={(event) => setQuery(event.currentTarget.value || "")}
                  onChange={(event) => setQuery(event.currentTarget.value || "")}
                />
                <s-stack direction="inline" gap="small-200">
                  <s-button
                    variant={categoryFilter === "all" ? "primary" : "secondary"}
                    onClick={() => setCategoryFilter("all")}
                  >
                    All
                  </s-button>
                  {GRAPHIC_CATEGORIES.map((category) => (
                    <s-button
                      key={category}
                      variant={categoryFilter === category ? "primary" : "secondary"}
                      onClick={() => setCategoryFilter(category)}
                    >
                      {category}
                    </s-button>
                  ))}
                </s-stack>
              </s-stack>
            </s-box>
            {filtered.length ? (
              <s-box padding="base">
                <div className="graphic-admin-grid">
                  {filtered.map((asset) => (
                    <s-box
                      key={asset.id}
                      padding="small"
                      border="base"
                      borderRadius="base"
                      background="base"
                    >
                      <s-stack gap="small">
                        <div className="graphic-admin-thumb">
                          <img src={asset.thumbnailUrl || asset.url} alt={asset.name} />
                        </div>
                        <s-stack gap="small-200">
                          <s-text>{asset.name}</s-text>
                          <s-stack direction="inline" gap="small-200">
                            <s-badge>{asset.category || "Other"}</s-badge>
                            {asset.type === "upload" ? <s-badge>Customer upload</s-badge> : null}
                          </s-stack>
                        </s-stack>
                        <fetcher.Form method="post">
                          <input type="hidden" name="intent" value="delete" />
                          <input type="hidden" name="id" value={asset.id} />
                          <s-button
                            type="submit"
                            variant="secondary"
                            tone="critical"
                            onClick={(event) => {
                              if (!window.confirm(`Delete “${asset.name}”?`)) event.preventDefault();
                            }}
                          >
                            Delete
                          </s-button>
                        </fetcher.Form>
                      </s-stack>
                    </s-box>
                  ))}
                </div>
              </s-box>
            ) : (
              <s-box padding="base">
                <s-paragraph>No graphics match this search.</s-paragraph>
              </s-box>
            )}
          </>
        ) : (
          <s-stack gap="small" alignItems="center">
            <s-heading>No graphics yet</s-heading>
            <s-paragraph>
              Upload logos and clip art here. They appear in the storefront customizer Graphics
              panel.
            </s-paragraph>
          </s-stack>
        )}
      </s-section>

      <s-section slot="aside" heading="Tips">
        <s-unordered-list>
          <s-list-item>Use square artwork around 1000×1000 px.</s-list-item>
          <s-list-item>Transparent PNG or SVG keeps product color visible.</s-list-item>
          <s-list-item>Name files clearly so merchants can find them later.</s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
