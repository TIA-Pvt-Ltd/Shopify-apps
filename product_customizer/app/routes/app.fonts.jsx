import { useEffect, useRef, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getOrCreateStore } from "../services/store.server";
import { deleteAsset, listAssets } from "../services/asset.server";
import { handleAdminAssetUpload, getAppUrl } from "../services/storefront-api.server";
import { WEB_SAFE_FONTS, GOOGLE_FONTS } from "../utils/customizer-defaults";
import { loadUploadedFontFaces } from "../utils/uploaded-fonts";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  const fonts = await listAssets(store.id, { type: "font", appUrl: getAppUrl(request) });
  return { fonts, systemFonts: WEB_SAFE_FONTS, googleFonts: GOOGLE_FONTS };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const result = await handleAdminAssetUpload(store, request);
    return result.error
      ? { ok: false, error: result.error }
      : { ok: true, uploaded: true };
  }
  const formData = await request.formData();
  if (formData.get("intent") === "delete") {
    const deleted = await deleteAsset(store.id, String(formData.get("id") || ""));
    return deleted
      ? { ok: true, deleted: true }
      : { ok: false, error: "Unable to delete that font." };
  }
  return { ok: false };
};

function fieldValue(root, selector) {
  return root?.querySelector(selector)?.value || "";
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

function fontFormat(url) {
  const ext = String(url || "").split(".").pop()?.toLowerCase() || "";
  if (ext === "woff2") return "WOFF2";
  if (ext === "woff") return "WOFF";
  if (ext === "otf") return "OTF";
  if (ext === "ttf") return "TTF";
  return "Font";
}

export default function FontsPage() {
  const { fonts, systemFonts, googleFonts } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const formRef = useRef(null);
  const [stagedFile, setStagedFile] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const uploading =
    fetcher.state !== "idle" && fetcher.formData?.get("type") === "font";
  const deleting =
    fetcher.state !== "idle" && fetcher.formData?.get("intent") === "delete";

  useEffect(() => {
    if (fetcher.data?.uploaded) {
      shopify.toast.show("Font uploaded");
      formRef.current?.reset();
      setStagedFile(null);
    } else if (fetcher.data?.deleted) {
      shopify.toast.show("Font deleted");
      setPendingDelete(null);
      document.getElementById("delete-font-modal")?.hideOverlay?.();
    } else if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  useEffect(() => {
    const id = "admin-google-fonts";
    let link = document.getElementById(id);
    if (!link) {
      link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = `https://fonts.googleapis.com/css2?${googleFonts
      .map((family) => `family=${encodeURIComponent(family)}`)
      .join("&")}&display=swap`;
  }, [googleFonts]);

  useEffect(() => {
    loadUploadedFontFaces(fonts);
  }, [fonts]);

  function submitUpload(form) {
    const file = selectedFile(form, stagedFile);
    if (!file) {
      shopify.toast.show("Choose a WOFF2, WOFF, TTF, or OTF file.", { isError: true });
      return;
    }
    const data = new FormData();
    data.append("type", "font");
    data.append("name", fieldValue(form, "s-text-field") || file.name.replace(/\.[^.]+$/, ""));
    data.append("file", file);
    fetcher.submit(data, { method: "post", encType: "multipart/form-data" });
  }

  return (
    <s-page heading={fonts.length ? `Fonts (${fonts.length} uploaded)` : "Fonts"}>
      <s-section heading="Available fonts">
        <s-paragraph color="subdued">
          These families are already in the storefront customizer text panel.
        </s-paragraph>
        <s-stack gap="base">
          <div>
            <s-text>System fonts</s-text>
            <div className="font-chip-row">
              {systemFonts.map((font) => (
                <span key={font} className="font-chip" style={{ fontFamily: font }}>
                  {font}
                </span>
              ))}
            </div>
          </div>
          <div>
            <s-text>Google fonts</s-text>
            <div className="font-chip-row">
              {googleFonts.map((font) => (
                <span key={font} className="font-chip" style={{ fontFamily: font }}>
                  {font}
                </span>
              ))}
            </div>
          </div>
        </s-stack>
      </s-section>

      <s-section heading="Upload a custom font">
        <s-paragraph color="subdued">
          Add a brand font for the customizer. Use WOFF2 when you can; TTF, OTF, and WOFF also work.
        </s-paragraph>
        <fetcher.Form
          method="post"
          encType="multipart/form-data"
          ref={formRef}
          onSubmit={(event) => {
            event.preventDefault();
            submitUpload(event.currentTarget);
          }}
        >
          <s-stack gap="base">
            <s-text-field
              name="name"
              label="Font family name"
              placeholder="Brand Sans"
              details="Leave blank to use the file name."
            />
            <s-drop-zone
              name="file"
              label="Font file"
              accept=".woff2,.woff,.ttf,.otf"
              details={
                stagedFile
                  ? `Selected: ${stagedFile.name}`
                  : "Accepts .woff2, .woff, .ttf, and .otf"
              }
              onChange={(event) => setStagedFile(event.currentTarget.files?.[0] || null)}
            />
            <label className="admin-file-input">
              Or choose a file
              <input
                type="file"
                accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf"
                onChange={(event) => setStagedFile(event.currentTarget.files?.[0] || null)}
              />
            </label>
            <s-stack direction="inline" gap="small">
              <s-button
                type="button"
                {...(uploading ? { loading: true } : {})}
                onClick={() => submitUpload(formRef.current)}
              >
                Upload font
              </s-button>
            </s-stack>
          </s-stack>
        </fetcher.Form>
      </s-section>

      <s-section heading="Uploaded fonts" padding={fonts.length ? "none" : "base"}>
        {fonts.length ? (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Font</s-table-header>
              <s-table-header>Format</s-table-header>
              <s-table-header listSlot="secondary">Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {fonts.map((font) => (
                <s-table-row key={font.id}>
                  <s-table-cell>
                    <s-stack gap="none">
                      <s-text>{font.name}</s-text>
                      <span className="admin-muted" style={{ fontFamily: font.name }}>
                        The quick brown fox
                      </span>
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>{fontFormat(font.url)}</s-table-cell>
                  <s-table-cell>
                    <s-button
                      type="button"
                      variant="secondary"
                      tone="critical"
                      commandFor="delete-font-modal"
                      command="--show"
                      onClick={() => setPendingDelete(font)}
                    >
                      Delete
                    </s-button>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        ) : (
          <s-stack gap="small" alignItems="center">
            <s-heading>No custom fonts uploaded</s-heading>
            <s-paragraph>
              Upload a font file above. It appears in the storefront customizer text panel.
            </s-paragraph>
          </s-stack>
        )}
      </s-section>

      <s-section slot="aside" heading="Tips">
        <s-unordered-list>
          <s-list-item>WOFF2 is smallest and loads fastest on the storefront.</s-list-item>
          <s-list-item>Use the family name customers should see in the font list.</s-list-item>
          <s-list-item>System and Google fonts are already available without uploading.</s-list-item>
        </s-unordered-list>
      </s-section>

      <s-modal id="delete-font-modal" heading="Delete font?" size="small">
        <s-text>
          Delete {pendingDelete?.name || "this font"}? Customers will no longer see it in the
          customizer.
        </s-text>
        <s-button
          slot="secondary-actions"
          variant="secondary"
          commandFor="delete-font-modal"
          command="--hide"
        >
          Cancel
        </s-button>
        <s-button
          slot="primary-action"
          variant="primary"
          tone="critical"
          {...(deleting ? { loading: true } : {})}
          onClick={() => {
            if (!pendingDelete?.id) return;
            const data = new FormData();
            data.set("intent", "delete");
            data.set("id", pendingDelete.id);
            fetcher.submit(data, { method: "post" });
          }}
        >
          Delete font
        </s-button>
      </s-modal>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
