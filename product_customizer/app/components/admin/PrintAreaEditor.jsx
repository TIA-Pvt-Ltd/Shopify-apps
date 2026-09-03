import { useEffect, useRef } from "react";
import CustomizerCanvas from "../canvas/CustomizerCanvas";

export default function PrintAreaEditor({
  imageUrl,
  width = 800,
  height = 800,
  printArea,
  onChange,
}) {
  const canvasRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const printAreaRef = useRef(printArea);
  onChangeRef.current = onChange;
  printAreaRef.current = printArea;

  useEffect(() => {
    const timer = setInterval(() => {
      const next = canvasRef.current?.getPrintArea?.();
      if (!next || !onChangeRef.current) return;
      const current = printAreaRef.current || {};
      if (
        Math.round(next.x) !== Math.round(current.x) ||
        Math.round(next.y) !== Math.round(current.y) ||
        Math.round(next.width) !== Math.round(current.width) ||
        Math.round(next.height) !== Math.round(current.height) ||
        Math.round(next.rotation) !== Math.round(current.rotation || 0)
      ) {
        onChangeRef.current({
          x: Math.round(next.x),
          y: Math.round(next.y),
          width: Math.round(next.width),
          height: Math.round(next.height),
          rotation: Math.round(next.rotation || 0),
          locked: Boolean(current.locked),
        });
      }
    }, 400);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="admin-canvas-wrap">
      <CustomizerCanvas
        ref={canvasRef}
        width={width}
        height={height}
        backgroundImage={imageUrl}
        printArea={printArea}
        allowOverflow
        merchantMode
      />
      <s-paragraph>
        Drag the dashed rectangle to set the printable area. Coordinates are saved
        relative to the product image.
      </s-paragraph>
    </div>
  );
}
