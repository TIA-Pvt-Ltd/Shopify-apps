export default function CanvasToolbar({
  canUndo,
  canRedo,
  zoom,
  onUndo,
  onRedo,
  onZoom,
  onDelete,
  onDuplicate,
  onAlign,
}) {
  return (
    <div className="canvas-toolbar" role="toolbar" aria-label="Canvas tools">
      <button type="button" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
        Undo
      </button>
      <button type="button" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)">
        Redo
      </button>
      <span className="toolbar-divider" />
      <button type="button" onClick={() => onAlign("left")} title="Align left">
        Left
      </button>
      <button type="button" onClick={() => onAlign("center")} title="Center">
        Center
      </button>
      <button type="button" onClick={() => onAlign("right")} title="Align right">
        Right
      </button>
      <span className="toolbar-divider" />
      <button type="button" onClick={onDuplicate} title="Duplicate (Ctrl+D)">
        Duplicate
      </button>
      <button type="button" onClick={onDelete} title="Delete">
        Delete
      </button>
      <span className="toolbar-divider" />
      <button type="button" onClick={() => onZoom(zoom - 0.1)} title="Zoom out">
        −
      </button>
      <span className="zoom-label">{Math.round(zoom * 100)}%</span>
      <button type="button" onClick={() => onZoom(zoom + 0.1)} title="Zoom in">
        +
      </button>
    </div>
  );
}
