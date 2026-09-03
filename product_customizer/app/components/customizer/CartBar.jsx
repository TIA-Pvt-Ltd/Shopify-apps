export default function CartBar({
  quantity,
  onQuantityChange,
  price,
  saving,
  adding,
  error,
  onSave,
  onAddToCart,
  onClose,
  minQuantity = 1,
  maxQuantity = 99,
}) {
  return (
    <div className="cart-bar">
      {error ? <p className="error">{error}</p> : null}
      <label className="qty">
        Qty
        <input
          type="number"
          min={minQuantity}
          max={maxQuantity}
          value={quantity}
          onChange={(event) => onQuantityChange(Number(event.target.value) || minQuantity)}
        />
      </label>
      <div className="cart-price">{price}</div>
      <button type="button" className="ghost" onClick={onSave} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </button>
      <button type="button" className="primary" onClick={onAddToCart} disabled={adding}>
        {adding ? "Adding…" : "Add to cart"}
      </button>
      {onClose ? (
        <button type="button" className="ghost cart-close" onClick={onClose}>
          Close
        </button>
      ) : null}
    </div>
  );
}
