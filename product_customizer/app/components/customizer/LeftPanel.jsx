import { WEB_SAFE_FONTS, GOOGLE_FONTS, GRAPHIC_CATEGORIES, GRAPHIC_TINTS, GRAPHIC_TINT_NONE } from "../../utils/customizer-defaults";
import { STARTER_GRAPHICS, svgDataUrl } from "../../utils/starter-graphics";
import { DESIGN_IDEAS, IDEA_CATEGORIES } from "../../utils/design-ideas";

const ALL_FONTS = [...WEB_SAFE_FONTS, ...GOOGLE_FONTS];

const TEXT_PRESETS = [
  {
    label: "Classic",
    fontFamily: "Montserrat",
    fontWeight: "bold",
    fontStyle: "normal",
    fill: "#111111",
    stroke: "#ffffff",
    strokeWidth: 3,
    textTransform: "none",
    shadowEnabled: false,
    curve: 0,
  },
  {
    label: "Varsity",
    fontFamily: "Anton",
    fontWeight: "normal",
    fontStyle: "normal",
    fill: "#c81e1e",
    stroke: "#ffffff",
    strokeWidth: 5,
    textTransform: "uppercase",
    shadowEnabled: false,
    curve: 0,
  },
  {
    label: "Script",
    fontFamily: "Pacifico",
    fontWeight: "normal",
    fontStyle: "normal",
    fill: "#111111",
    stroke: "#ffffff",
    strokeWidth: 0,
    textTransform: "none",
    shadowEnabled: false,
    curve: 18,
  },
  {
    label: "Stamp",
    fontFamily: "Bebas Neue",
    fontWeight: "normal",
    fontStyle: "normal",
    fill: "#111111",
    stroke: "#ffffff",
    strokeWidth: 0,
    textTransform: "uppercase",
    shadowEnabled: true,
    shadowBlur: 5,
    shadowOffsetX: 2,
    shadowOffsetY: 2,
    curve: 0,
  },
];

const TOOLS = [
  { id: "text", key: "text", label: "Text", icon: IconText },
  { id: "graphic", key: "graphic", label: "Graphics", icon: IconGraphic },
  { id: "upload", key: "upload", label: "Upload", icon: IconUpload },
  { id: "qr", key: "qrCode", label: "QR", icon: IconQr },
  { id: "names", key: "namesNumbers", label: "Name/#", icon: IconNames },
  { id: "ideas", key: "designIdeas", label: "Ideas", icon: IconIdeas },
  { id: "saved", key: "savedDesigns", label: "Saved", icon: IconSaved, always: true },
];

export function ToolRail({ tools, activeTool, onToolChange }) {
  return (
    <nav className="tool-rail" aria-label="Design tools">
      {TOOLS.filter((tool) => tool.always || tools?.[tool.key] !== false).map((tool) => (
        <button
          key={tool.id}
          type="button"
          className={activeTool === tool.id ? "active" : ""}
          onClick={() => onToolChange(tool.id)}
        >
          <tool.icon />
          <span>{tool.label}</span>
        </button>
      ))}
    </nav>
  );
}

export default function LeftPanel({
  product,
  variants,
  selectedVariantId,
  onVariantChange,
  colors,
  selectedColor,
  onColorChange,
  extraOptions,
  optionSelections,
  onOptionChange,
  tools,
  assets,
  fonts,
  activeTool,
  onToolChange,
  onAddText,
  onAddGraphic,
  onAddQr,
  onAddNamesNumbers,
  onApplyIdea,
  onUpload,
  uploadProgress,
  uploadError,
  textProps,
  onTextPropsChange,
  graphicProps,
  onGraphicPropsChange,
  savedDesigns = [],
  activeSavedId = "",
  loadingSavedId = "",
  onLoadSaved,
  onRemoveSaved,
  onSaveCopy,
}) {
  const availableFonts = [
    ...ALL_FONTS,
    ...(fonts || []).map((font) => font.name),
  ].filter((value, index, list) => list.indexOf(value) === index);

  return (
    <aside className="customizer-inspector">
      <div className="panel-section">
        <h2>Product</h2>
        {colors?.length ? (
          <div>
            <p>Color {selectedColor?.name ? `· ${selectedColor.name}` : ""}</p>
            <div className="swatches">
              {colors.map((color) => (
                <button
                  key={color.id || color.hex}
                  type="button"
                  className={selectedColor?.id === color.id ? "swatch active" : "swatch"}
                  style={{
                    backgroundColor: color.hex,
                    backgroundImage: color.imageUrl ? `url(${color.imageUrl})` : undefined,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                  title={color.name}
                  aria-label={color.name}
                  onClick={() => onColorChange(color)}
                />
              ))}
            </div>
          </div>
        ) : null}
        {(extraOptions || []).map((option) => (
          <label key={option.name}>
            {option.name}
            <select
              value={optionSelections?.[option.name] || ""}
              onChange={(event) => onOptionChange?.(option.name, event.target.value)}
            >
              {(option.values || []).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        ))}
        {!colors?.length && !(extraOptions || []).length ? (
          <label>
            Variant
            <select value={selectedVariantId} onChange={(event) => onVariantChange(event.target.value)}>
              {(variants || []).map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.title}
                  {variant.price ? ` · $${Number(variant.price).toFixed(2)}` : ""}
                </option>
              ))}
              {!variants?.length && product ? <option value={product.id}>{product.title}</option> : null}
            </select>
          </label>
        ) : null}
      </div>

      {activeTool === "text" && (
        <div className="panel-section">
          <h3>Text</h3>
          <div className="style-presets">
            {TEXT_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => onTextPropsChange({ ...textProps, ...preset })}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <label>
            Content
            <textarea
              value={textProps.text}
              onChange={(event) => onTextPropsChange({ ...textProps, text: event.target.value })}
            />
          </label>
          <label>
            Font
            <select
              value={textProps.fontFamily}
              onChange={(event) => onTextPropsChange({ ...textProps, fontFamily: event.target.value })}
              style={{ fontFamily: textProps.fontFamily }}
            >
              {availableFonts.map((font) => (
                <option key={font} value={font} style={{ fontFamily: font }}>
                  {font}
                </option>
              ))}
            </select>
          </label>
          <div className="field-row">
            <label>
              Size
              <input
                type="number"
                min="8"
                max="200"
                value={textProps.fontSize}
                onChange={(event) => onTextPropsChange({ ...textProps, fontSize: Number(event.target.value) })}
              />
            </label>
            <label>
              Weight
              <select
                value={textProps.fontWeight}
                onChange={(event) => onTextPropsChange({ ...textProps, fontWeight: event.target.value })}
              >
                <option value="normal">Regular</option>
                <option value="600">Medium</option>
                <option value="bold">Bold</option>
                <option value="800">Black</option>
              </select>
            </label>
          </div>
          <div className="field-row">
            <label>
              Fill
              <input
                type="color"
                value={textProps.fill || "#111111"}
                onChange={(event) => onTextPropsChange({ ...textProps, fill: event.target.value })}
              />
            </label>
            <label>
              Outline
              <input
                type="color"
                value={textProps.stroke || "#ffffff"}
                onChange={(event) => onTextPropsChange({ ...textProps, stroke: event.target.value })}
              />
            </label>
          </div>
          <div className="field-row">
            <label>
              Outline width
              <input
                type="number"
                min="0"
                max="24"
                step="0.5"
                value={textProps.strokeWidth ?? 0}
                onChange={(event) =>
                  onTextPropsChange({ ...textProps, strokeWidth: Number(event.target.value) || 0 })
                }
              />
            </label>
            <label>
              Case
              <select
                value={textProps.textTransform || "none"}
                onChange={(event) => onTextPropsChange({ ...textProps, textTransform: event.target.value })}
              >
                <option value="none">As typed</option>
                <option value="uppercase">Uppercase</option>
                <option value="lowercase">Lowercase</option>
                <option value="capitalize">Title case</option>
              </select>
            </label>
          </div>
          <div className="inline-actions">
            <button
              type="button"
              className={textProps.fontStyle === "italic" ? "active" : ""}
              onClick={() =>
                onTextPropsChange({
                  ...textProps,
                  fontStyle: textProps.fontStyle === "italic" ? "normal" : "italic",
                })
              }
            >
              Italic
            </button>
            <button
              type="button"
              className={textProps.underline ? "active" : ""}
              onClick={() => onTextPropsChange({ ...textProps, underline: !textProps.underline })}
            >
              Underline
            </button>
            <button
              type="button"
              className={textProps.linethrough ? "active" : ""}
              onClick={() => onTextPropsChange({ ...textProps, linethrough: !textProps.linethrough })}
            >
              Strike
            </button>
          </div>
          <div className="field-row">
            <label>
              Align
              <select
                value={textProps.textAlign}
                onChange={(event) => onTextPropsChange({ ...textProps, textAlign: event.target.value })}
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
            <label>
              Rotate
              <input
                type="number"
                value={textProps.angle}
                onChange={(event) => onTextPropsChange({ ...textProps, angle: Number(event.target.value) })}
              />
            </label>
          </div>
          <div className="field-row">
            <label>
              Tracking
              <input
                type="number"
                value={textProps.charSpacing}
                onChange={(event) => onTextPropsChange({ ...textProps, charSpacing: Number(event.target.value) })}
              />
            </label>
            <label>
              Leading
              <input
                type="number"
                step="0.05"
                value={textProps.lineHeight}
                onChange={(event) => onTextPropsChange({ ...textProps, lineHeight: Number(event.target.value) })}
              />
            </label>
          </div>
          <label>
            <span className="field-label-row">
              Opacity
              <span>{Math.round((textProps.opacity ?? 1) * 100)}%</span>
            </span>
            <input
              type="range"
              min="0.15"
              max="1"
              step="0.05"
              value={textProps.opacity ?? 1}
              onChange={(event) => onTextPropsChange({ ...textProps, opacity: Number(event.target.value) })}
            />
          </label>
          <label>
            <span className="field-label-row">
              Curve
              <span>{Math.round(textProps.curve || 0)}</span>
            </span>
            <input
              type="range"
              min="-80"
              max="80"
              step="1"
              value={textProps.curve || 0}
              onChange={(event) => onTextPropsChange({ ...textProps, curve: Number(event.target.value) })}
            />
          </label>
          <div className="inline-actions">
            <button
              type="button"
              className={textProps.shadowEnabled ? "active" : ""}
              onClick={() =>
                onTextPropsChange({
                  ...textProps,
                  shadowEnabled: !textProps.shadowEnabled,
                  shadowBlur: textProps.shadowBlur || 6,
                })
              }
            >
              Shadow
            </button>
            <button
              type="button"
              className={textProps.flipX ? "active" : ""}
              onClick={() => onTextPropsChange({ ...textProps, flipX: !textProps.flipX })}
            >
              Flip H
            </button>
            <button
              type="button"
              className={textProps.flipY ? "active" : ""}
              onClick={() => onTextPropsChange({ ...textProps, flipY: !textProps.flipY })}
            >
              Flip V
            </button>
          </div>
          {textProps.shadowEnabled ? (
            <div className="field-row">
              <label>
                Shadow color
                <input
                  type="color"
                  value={textProps.shadowColor || "#000000"}
                  onChange={(event) => onTextPropsChange({ ...textProps, shadowColor: event.target.value })}
                />
              </label>
              <label>
                Shadow blur
                <input
                  type="number"
                  min="0"
                  max="24"
                  value={textProps.shadowBlur ?? 6}
                  onChange={(event) =>
                    onTextPropsChange({ ...textProps, shadowBlur: Number(event.target.value) || 0 })
                  }
                />
              </label>
            </div>
          ) : null}
          <button type="button" className="primary" onClick={() => onAddText()}>
            Add text to design
          </button>
        </div>
      )}

      {activeTool === "graphic" && (
        <div className="panel-section">
          <h3>Graphics</h3>
          <GraphicStyleControls props={graphicProps} onChange={onGraphicPropsChange} showColor />
      <p>Tap a graphic to place it on the product. Original keeps the artwork colors; pick a swatch to recolor it.</p>
          {GRAPHIC_CATEGORIES.map((category) => {
            const items = [
              ...STARTER_GRAPHICS.filter((item) => item.category === category),
              ...(assets || []).filter((asset) => asset.category === category),
            ];
            if (!items.length) return null;
            return (
              <div key={category} className="graphic-group">
                <h4>{category}</h4>
                <div className="graphic-grid">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      title={item.name}
                      onClick={() =>
                        onAddGraphic(item.svg ? svgDataUrl(item.svg) : item.url, item.name, {
                          fill: graphicProps?.fill || GRAPHIC_TINT_NONE,
                        })
                      }
                    >
                      <img src={item.svg ? svgDataUrl(item.svg) : item.thumbnailUrl || item.url} alt={item.name} />
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTool === "qr" && (
        <>
          <div className="panel-section">
            <GraphicStyleControls props={graphicProps} onChange={onGraphicPropsChange} />
          </div>
          <QrForm onAdd={onAddQr} />
        </>
      )}
      {activeTool === "upload" && (
        <div className="panel-section">
          <h3>Upload artwork</h3>
          <GraphicStyleControls props={graphicProps} onChange={onGraphicPropsChange} />
          <p>PNG, JPG, or SVG. Click or drop a file onto the product.</p>
          <label className="dropzone">
            <strong>Upload file</strong>
            <span>Max size is set by the merchant</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onUpload(file);
                event.target.value = "";
              }}
            />
          </label>
          {uploadProgress > 0 && uploadProgress < 100 ? (
            <div className="progress" aria-valuenow={uploadProgress}>
              <span style={{ width: `${uploadProgress}%` }} />
            </div>
          ) : null}
          {uploadError ? <p className="error">{uploadError}</p> : null}
        </div>
      )}
      {activeTool === "names" && <NamesForm onAdd={onAddNamesNumbers} fonts={availableFonts} />}
      {activeTool === "ideas" && (
        <div className="panel-section">
          <h3>Design ideas</h3>
          <p>Start with a professional layout, then edit type on the canvas.</p>
          {IDEA_CATEGORIES.map((category) => {
            const items = DESIGN_IDEAS.filter((idea) => idea.category === category);
            if (!items.length) return null;
            return (
              <div key={category} className="idea-group">
                <h4>{category}</h4>
                <div className="ideas-grid">
                  {items.map((idea) => (
                    <button
                      key={idea.id}
                      type="button"
                      className="idea-card"
                      onClick={() => onApplyIdea?.(idea)}
                    >
                      <span className={`idea-card-preview ${idea.previewClass || ""}`}>
                        {idea.preview.map((line, index) => (
                          <span key={`${idea.id}-${index}`}>{line}</span>
                        ))}
                      </span>
                      <strong>{idea.name}</strong>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {activeTool === "saved" && (
        <SavedDesigns
          designs={savedDesigns}
          activeId={activeSavedId}
          loadingId={loadingSavedId}
          onLoad={onLoadSaved}
          onRemove={onRemoveSaved}
          onSaveCopy={onSaveCopy}
        />
      )}
    </aside>
  );
}

function SavedDesigns({ designs, activeId, loadingId, onLoad, onRemove, onSaveCopy }) {
  return (
    <div className="panel-section">
      <h3>Saved designs</h3>
      <p>Open a design to keep editing it on the canvas.</p>
      {onSaveCopy ? (
        <button type="button" className="primary" onClick={onSaveCopy}>
          Save a copy
        </button>
      ) : null}
      {!designs.length ? (
        <p className="saved-empty">No saved designs yet. Click Save in the top bar to keep this one.</p>
      ) : (
        <div className="saved-grid">
          {designs.map((design) => (
            <article
              key={design.publicId}
              className={design.publicId === activeId ? "saved-card is-active" : "saved-card"}
            >
              <button
                type="button"
                className="saved-card-preview"
                onClick={() => onLoad(design)}
                disabled={loadingId === design.publicId}
              >
                {design.previewUrl ? (
                  <img src={design.previewUrl} alt="" />
                ) : (
                  <span>No preview</span>
                )}
                {design.publicId === activeId ? <em>On canvas</em> : null}
              </button>
              <div className="saved-card-meta">
                <span>
                  {design.savedAt
                    ? new Date(design.savedAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })
                    : design.publicId}
                </span>
                <button type="button" onClick={() => onRemove(design.publicId)}>
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function GraphicStyleControls({ props, onChange, showColor = false }) {
  if (!props || !onChange) return null;
  return (
    <div className="graphic-style">
      {showColor ? (
        <div>
          Color
          <div className="graphic-tints">
            <button
              type="button"
              className={!props.fill ? "swatch none active" : "swatch none"}
              aria-label="No color, keep original artwork"
              title="Original"
              onClick={() => onChange({ ...props, fill: GRAPHIC_TINT_NONE })}
            />
            {GRAPHIC_TINTS.map((hex) => (
              <button
                key={hex}
                type="button"
                className={props.fill === hex ? "swatch active" : "swatch"}
                style={{ backgroundColor: hex }}
                aria-label={`Graphic color ${hex}`}
                onClick={() => onChange({ ...props, fill: hex })}
              />
            ))}
            <input
              type="color"
              value={props.fill || "#111111"}
              aria-label="Custom graphic color"
              onChange={(event) => onChange({ ...props, fill: event.target.value })}
            />
          </div>
        </div>
      ) : null}
      <label>
        <span className="field-label-row">
          Opacity
          <span>{Math.round((props.opacity ?? 1) * 100)}%</span>
        </span>
        <input
          type="range"
          min="0.05"
          max="1"
          step="0.05"
          value={props.opacity ?? 1}
          onChange={(event) => onChange({ ...props, opacity: Number(event.target.value) })}
        />
      </label>
      <div className="field-row">
        <label>
          Rotate
          <input
            type="number"
            value={props.angle || 0}
            onChange={(event) => onChange({ ...props, angle: Number(event.target.value) || 0 })}
          />
        </label>
        <div className="inline-actions">
          <button
            type="button"
            className={props.flipX ? "active" : ""}
            onClick={() => onChange({ ...props, flipX: !props.flipX })}
          >
            Flip H
          </button>
          <button
            type="button"
            className={props.flipY ? "active" : ""}
            onClick={() => onChange({ ...props, flipY: !props.flipY })}
          >
            Flip V
          </button>
        </div>
      </div>
    </div>
  );
}

function QrForm({ onAdd }) {
  const kinds = [
    { id: "url", label: "URL", placeholder: "https://" },
    { id: "text", label: "Text", placeholder: "Your message" },
    { id: "email", label: "Email", placeholder: "name@example.com" },
    { id: "phone", label: "Phone", placeholder: "+1 555 0100" },
  ];
  return (
    <form
      className="panel-section"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const kind = String(data.get("kind") || "url");
        const value = String(data.get("value") || "");
        const encoded = kind === "email" ? `mailto:${value}` : kind === "phone" ? `tel:${value}` : value;
        onAdd({ kind, value: encoded });
      }}
    >
      <h3>QR code</h3>
      <label>
        Type
        <select name="kind" defaultValue="url">
          {kinds.map((kind) => (
            <option key={kind.id} value={kind.id}>
              {kind.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Content
        <input name="value" required placeholder="https://your-site.com" />
      </label>
      <button type="submit" className="primary">
        Add QR code
      </button>
    </form>
  );
}

function NamesForm({ onAdd, fonts }) {
  return (
    <form
      className="panel-section"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        onAdd({
          name: String(data.get("name") || "NAME"),
          number: String(data.get("number") || "00"),
          fill: String(data.get("fill") || "#111111"),
          fontFamily: String(data.get("fontFamily") || "Arial"),
          fontSize: Number(data.get("fontSize") || 28),
        });
      }}
    >
      <h3>Names or numbers</h3>
      <label>
        Name
        <input name="name" defaultValue="PLAYER" />
      </label>
      <label>
        Number
        <input name="number" defaultValue="10" />
      </label>
      <label>
        Font
        <select name="fontFamily" defaultValue="Anton">
          {fonts.map((font) => (
            <option key={font} value={font}>
              {font}
            </option>
          ))}
        </select>
      </label>
      <div className="field-row">
        <label>
          Color
          <input type="color" name="fill" defaultValue="#111111" />
        </label>
        <label>
          Size
          <input type="number" name="fontSize" defaultValue="28" min="10" />
        </label>
      </div>
      <button type="submit" className="primary">
        Add to design
      </button>
    </form>
  );
}

function IconText() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 6h14M12 6v12M8 18h8" />
    </svg>
  );
}
function IconGraphic() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="M4 16l5-4 4 3 3-2 4 3" />
    </svg>
  );
}
function IconUpload() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 16V7M8 10l4-4 4 4" />
      <path d="M5 18h14" />
    </svg>
  );
}
function IconQr() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="4" width="7" height="7" />
      <rect x="13" y="4" width="7" height="7" />
      <rect x="4" y="13" width="7" height="7" />
      <path d="M13 13h3v3h-3zM18 18h2M13 20h4" />
    </svg>
  );
}
function IconNames() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="8" cy="8" r="3" />
      <path d="M3 19c.6-3 2.7-5 5-5s4.4 2 5 5" />
      <path d="M16 8h5M18.5 5.5v5" />
    </svg>
  );
}
function IconIdeas() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3 11c.6.6 1 1.5 1 2h4c0-.5.4-1.4 1-2a6 6 0 0 0-3-11z" />
    </svg>
  );
}
function IconSaved() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 4h9l5 5v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <path d="M15 4v5h5M8 13h8M8 17h5" />
    </svg>
  );
}
