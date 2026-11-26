import { useEffect, useRef } from "react";
import { ContextualSaveBar } from "@shopify/polaris";

interface SaveBarApi {
  show: (id: string) => Promise<void>;
  hide: (id: string) => Promise<void>;
}

function shopifySaveBar(): SaveBarApi | undefined {
  return (window as Window & { shopify?: { saveBar?: SaveBarApi } }).shopify?.saveBar;
}

/**
 * Unsaved-change save UX for settings pages.
 * Embedded admin: App Bridge ui-save-bar in the Shopify chrome.
 * Fallback: Polaris ContextualSaveBar inside the app Frame.
 */
export function useSaveBar(options: {
  id: string;
  dirty: boolean;
  saving?: boolean;
  onSave: () => void;
  onDiscard: () => void;
  message?: string;
}) {
  const { id, dirty, saving = false, onSave, onDiscard, message = "Unsaved changes" } = options;
  const onSaveRef = useRef(onSave);
  const onDiscardRef = useRef(onDiscard);
  onSaveRef.current = onSave;
  onDiscardRef.current = onDiscard;

  const bridge = typeof window !== "undefined" ? shopifySaveBar() : undefined;

  useEffect(() => {
    if (!bridge) return;
    if (dirty) void bridge.show(id).catch(() => undefined);
    else void bridge.hide(id).catch(() => undefined);
    return () => {
      void bridge.hide(id).catch(() => undefined);
    };
  }, [bridge, id, dirty]);

  return {
    saveBar: (
      <>
        <ui-save-bar id={id} discardConfirmation="">
          <button
            type="button"
            variant="primary"
            disabled={!dirty || saving}
            {...(saving ? { loading: "" } : {})}
            onClick={() => onSaveRef.current()}
          >
            Save
          </button>
          <button type="button" disabled={saving} onClick={() => onDiscardRef.current()}>
            Discard
          </button>
        </ui-save-bar>
        {!bridge && dirty ? (
          <ContextualSaveBar
            message={message}
            saveAction={{
              content: "Save",
              loading: saving,
              disabled: saving,
              onAction: () => onSaveRef.current(),
            }}
            discardAction={{
              content: "Discard",
              disabled: saving,
              discardConfirmationModal: true,
              onAction: () => onDiscardRef.current(),
            }}
          />
        ) : null}
      </>
    ),
  };
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "ui-save-bar": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        id?: string;
        discardConfirmation?: string;
      };
    }
  }
}
