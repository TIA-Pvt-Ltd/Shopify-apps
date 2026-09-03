export default function LayerManager({ layers, onSelect, onLayer, onLock, onHide, onDelete }) {
  const designLayers = (layers || []).filter(
    (layer) => !["background", "colorOverlay", "printArea", "guide"].includes(layer.type),
  );

  if (!designLayers.length) {
    return (
      <div className="layer-empty">
        No layers yet. Add text or a graphic to get started.
      </div>
    );
  }

  return (
    <ul className="layer-list">
      {designLayers.map((layer) => (
        <li key={layer.id}>
          <button type="button" className="layer-name" onClick={() => onSelect(layer.id)}>
            {layer.name}
          </button>
          <div className="layer-actions">
            <button type="button" title="Move up" onClick={() => onLayer("up", layer.id)}>
              ↑
            </button>
            <button type="button" title="Move down" onClick={() => onLayer("down", layer.id)}>
              ↓
            </button>
            <button type="button" title="Bring to front" onClick={() => onLayer("front", layer.id)}>
              ⤒
            </button>
            <button type="button" title="Send to back" onClick={() => onLayer("back", layer.id)}>
              ⤓
            </button>
            <button type="button" title={layer.locked ? "Unlock" : "Lock"} onClick={() => onLock(layer.id)}>
              {layer.locked ? "Unlock" : "Lock"}
            </button>
            <button type="button" title={layer.visible === false ? "Show" : "Hide"} onClick={() => onHide(layer.id)}>
              {layer.visible === false ? "Show" : "Hide"}
            </button>
            <button type="button" title="Delete" onClick={() => onDelete(layer.id)}>
              ✕
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
