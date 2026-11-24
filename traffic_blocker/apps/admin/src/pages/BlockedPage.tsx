import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Banner, BlockStack, Button, Card, Page, Text, TextField } from "@shopify/polaris";
import { DEFAULT_BLOCKED_PAGE, type BlockedPageContent, type BlockedPageMode } from "@traffic-blocker/shared-types";
import { api } from "../api";

const MODES: Array<{ id: BlockedPageMode; title: string; detail: string }> = [
  { id: "generated", title: "Designed page", detail: "Heading, message, and colors" },
  { id: "blank", title: "Blank page", detail: "A quiet full-screen color" },
  { id: "custom", title: "Custom HTML", detail: "Your own page markup" },
  { id: "redirect", title: "Redirect", detail: "Send visitors to a link" },
];

export function BlockedPageEditor({ notify }: { notify: (message: string) => void }) {
  const query = useQuery({ queryKey: ["blocked-page"], queryFn: () => api<BlockedPageContent>("/api/v1/blocked-page") });
  const [page, setPage] = useState<BlockedPageContent>(DEFAULT_BLOCKED_PAGE);
  const [html, setHtml] = useState("");
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    if (query.data) setPage({ ...DEFAULT_BLOCKED_PAGE, ...query.data, mode: query.data.mode ?? "generated" });
  }, [query.data]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void api<{ html: string }>("/api/v1/blocked-page/preview", { method: "POST", body: JSON.stringify(page) })
        .then((result) => setHtml(result.html))
        .catch(() => undefined);
    }, 280);
    return () => window.clearTimeout(timer);
  }, [page]);
  const save = useMutation({
    mutationFn: () => api("/api/v1/blocked-page", { method: "PUT", body: JSON.stringify(page) }),
    onSuccess: () => notify("Blocked page saved"),
    onError: (error: Error) => notify(error.message),
  });
  const mode = page.mode ?? "generated";
  return (
    <Page title="Blocked page" subtitle="Choose what a blocked visitor sees. The store stays hidden behind this page.">
      <BlockStack gap="400">
        {query.isError ? <Banner tone="critical" title={query.error instanceof Error ? query.error.message : "Blocked page could not be loaded"} /> : null}
        <div className="tb-mode-grid" role="radiogroup" aria-label="Restriction page type">
          {MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={mode === item.id}
              className={mode === item.id ? "tb-mode is-selected" : "tb-mode"}
              onClick={() => setPage({ ...page, mode: item.id, autoRedirect: item.id === "redirect" ? true : page.autoRedirect })}
            >
              <ModeArt mode={item.id} color={page.backgroundColor} />
              <span className="tb-mode-copy">
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="tb-studio">
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">{MODES.find((item) => item.id === mode)?.title}</Text>
              {mode === "generated" ? (
                <>
                  <TextField label="Heading" value={page.heading} onChange={(heading) => setPage({ ...page, heading })} autoComplete="off" />
                  <TextField label="Description" value={page.description} multiline={3} onChange={(description) => setPage({ ...page, description })} autoComplete="off" />
                  <div className="tb-form-grid">
                    <TextField label="Contact email" value={page.contactEmail ?? ""} onChange={(contactEmail) => setPage({ ...page, contactEmail })} autoComplete="off" />
                    <TextField label="Support URL" value={page.supportUrl ?? ""} onChange={(supportUrl) => setPage({ ...page, supportUrl })} autoComplete="off" />
                  </div>
                  <div className="tb-form-grid">
                    <ColorField label="Background" value={page.backgroundColor} onChange={(backgroundColor) => setPage({ ...page, backgroundColor })} />
                    <ColorField label="Text color" value={page.textColor} onChange={(textColor) => setPage({ ...page, textColor })} />
                  </div>
                  <div className="tb-type-row" role="group" aria-label="Typography">
                    {(["system", "serif", "mono"] as const).map((font) => (
                      <button key={font} type="button" className={page.fontFamily === font ? "tb-type is-selected" : "tb-type"} data-font={font} onClick={() => setPage({ ...page, fontFamily: font })}>
                        {font === "system" ? "System" : font === "serif" ? "Serif" : "Mono"}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
              {mode === "blank" ? (
                <>
                  <p className="tb-mode-note">Visitors see only this color. No heading, logo, or button is shown.</p>
                  <ColorField label="Background" value={page.backgroundColor} onChange={(backgroundColor) => setPage({ ...page, backgroundColor })} />
                </>
              ) : null}
              {mode === "custom" ? (
                <div className="tb-code">
                  <TextField label="Custom HTML" value={page.customHtml ?? ""} multiline={14} onChange={(customHtml) => setPage({ ...page, customHtml })} autoComplete="off" helpText="Paste a full HTML document or a fragment. It replaces the designed page." />
                </div>
              ) : null}
              {mode === "redirect" ? (
                <>
                  <p className="tb-mode-note">Blocked visitors leave the store and open this https address immediately.</p>
                  <TextField label="Redirect URL" value={page.redirectUrl ?? ""} onChange={(redirectUrl) => setPage({ ...page, redirectUrl, autoRedirect: true })} autoComplete="off" placeholder="https://example.com" />
                </>
              ) : null}
              <div>
                <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Save</Button>
              </div>
            </BlockStack>
          </Card>
          <section className="tb-stage" aria-label="Restriction page preview">
            <div className="tb-stage-bar">
              <strong>Preview</strong>
              <div className="tb-stage-switch" role="group" aria-label="Preview width">
                <button type="button" className={mobile ? "" : "is-selected"} onClick={() => setMobile(false)}>Desktop</button>
                <button type="button" className={mobile ? "is-selected" : ""} onClick={() => setMobile(true)}>Mobile</button>
              </div>
            </div>
            <div className={mobile ? "tb-preview mobile" : "tb-preview"}>
              {html ? <iframe title="Blocked page preview" srcDoc={html} /> : <div className="tb-stage-empty">Preview is loading</div>}
            </div>
          </section>
        </div>
      </BlockStack>
    </Page>
  );
}

function ModeArt({ mode, color }: { mode: BlockedPageMode; color: string }) {
  const fill = /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#0f172a";
  if (mode === "blank") return <span className="tb-mode-art" style={{ background: fill }} aria-hidden="true" />;
  if (mode === "custom") {
    return (
      <span className="tb-mode-art tb-mode-code" aria-hidden="true">
        <i /><i /><i />
      </span>
    );
  }
  if (mode === "redirect") {
    return (
      <span className="tb-mode-art tb-mode-redirect" aria-hidden="true">
        <b />
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M7 17 17 7M9 7h8v8" /></svg>
      </span>
    );
  }
  return (
    <span className="tb-mode-art tb-mode-designed" style={{ background: fill }} aria-hidden="true">
      <span />
    </span>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const swatch = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000";
  return (
    <div className="tb-color">
      <TextField label={label} value={value} onChange={onChange} autoComplete="off" />
      <input aria-label={`${label} swatch`} type="color" value={swatch} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
