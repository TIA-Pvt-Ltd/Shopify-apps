import { useState } from "react";
import PrintAreaEditor from "./PrintAreaEditor";
import { VIEW_TYPES, defaultPrintArea } from "../../utils/customizer-defaults";

export default function ViewConfigurator({ views, onChange, onUpload }) {
  const [uploadingId, setUploadingId] = useState("");

  const updateView = (id, patch) => {
    onChange(views.map((view) => (view.id === id ? { ...view, ...patch } : view)));
  };

  const addView = () => {
    onChange([
      ...views,
      {
        id: `tmp-${crypto.randomUUID()}`,
        name: "Custom view",
        type: "custom",
        imageUrl: "",
        sortOrder: views.length,
        width: 800,
        height: 800,
        printArea: defaultPrintArea(),
      },
    ]);
  };

  return (
    <s-stack direction="block" gap="base">
      {views.map((view) => (
        <div key={view.id} className="admin-view-card">
          <s-stack direction="block" gap="base">
            <s-heading>{view.name}</s-heading>
            <div className="admin-form-grid">
              <label>
                Name
                <input
                  value={view.name}
                  onChange={(event) => updateView(view.id, { name: event.target.value })}
                />
              </label>
              <label>
                Type
                <select
                  value={view.type}
                  onChange={(event) => updateView(view.id, { type: event.target.value })}
                >
                  {VIEW_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Width
                <input
                  type="number"
                  value={view.width}
                  onChange={(event) => updateView(view.id, { width: Number(event.target.value) || 800 })}
                />
              </label>
              <label>
                Height
                <input
                  type="number"
                  value={view.height}
                  onChange={(event) => updateView(view.id, { height: Number(event.target.value) || 800 })}
                />
              </label>
            </div>
            <label>
              Product image
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setUploadingId(view.id);
                  const url = await onUpload(file);
                  setUploadingId("");
                  if (url) updateView(view.id, { imageUrl: url });
                }}
              />
              {uploadingId === view.id ? <span>Uploading…</span> : null}
            </label>
            <PrintAreaEditor
              imageUrl={view.imageUrl}
              width={view.width}
              height={view.height}
              printArea={view.printArea || defaultPrintArea(view.width, view.height)}
              onChange={(printArea) => updateView(view.id, { printArea })}
            />
            <div className="admin-form-grid">
              {["x", "y", "width", "height", "rotation"].map((key) => (
                <label key={key}>
                  {key}
                  <input
                    type="number"
                    value={view.printArea?.[key] ?? 0}
                    onChange={(event) =>
                      updateView(view.id, {
                        printArea: {
                          ...(view.printArea || defaultPrintArea()),
                          [key]: Number(event.target.value) || 0,
                        },
                      })
                    }
                  />
                </label>
              ))}
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(view.printArea?.locked)}
                  onChange={(event) =>
                    updateView(view.id, {
                      printArea: {
                        ...(view.printArea || defaultPrintArea()),
                        locked: event.target.checked,
                      },
                    })
                  }
                />
                Lock print area
              </label>
            </div>
            <s-button
              variant="secondary"
              onClick={() => onChange(views.filter((item) => item.id !== view.id))}
            >
              Remove view
            </s-button>
          </s-stack>
        </div>
      ))}
      <s-button onClick={addView}>Add view</s-button>
    </s-stack>
  );
}
