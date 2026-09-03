export default function RightViews({ views, activeViewId, onSelect }) {
  return (
    <aside className="customizer-right">
      <h2>Views</h2>
      <div className="view-list">
        {(views || []).map((view) => (
          <button
            key={view.id}
            type="button"
            className={view.id === activeViewId ? "view-thumb active" : "view-thumb"}
            onClick={() => onSelect(view.id)}
          >
            {view.imageUrl ? (
              <img src={view.imageUrl} alt="" />
            ) : (
              <span className="view-fallback">{view.name?.[0] || "V"}</span>
            )}
            <strong>{view.name}</strong>
          </button>
        ))}
      </div>
    </aside>
  );
}
