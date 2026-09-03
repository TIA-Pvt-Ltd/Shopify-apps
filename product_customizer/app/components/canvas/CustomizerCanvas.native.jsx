import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import QRCode from "qrcode";
import { createHistory, pushHistory, redoHistory, undoHistory } from "./history";
import { nextObjectName } from "./objects";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `obj-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const imageCache = new Map();
let tintScratch = null;

function getTintScratch() {
  if (typeof document === "undefined") return null;
  if (!tintScratch) tintScratch = document.createElement("canvas");
  return tintScratch;
}

function drawGraphic(ctx, image, width, height, fill) {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const scratch = fill ? getTintScratch() : null;
  if (!scratch) {
    ctx.drawImage(image, 0, 0, w, h);
    return;
  }
  const offW = Math.max(1, Math.round(w));
  const offH = Math.max(1, Math.round(h));
  if (scratch.width !== offW) scratch.width = offW;
  if (scratch.height !== offH) scratch.height = offH;
  const off = scratch.getContext("2d");
  off.clearRect(0, 0, offW, offH);
  off.globalCompositeOperation = "source-over";
  off.drawImage(image, 0, 0, offW, offH);
  off.globalCompositeOperation = "source-in";
  off.fillStyle = fill;
  off.fillRect(0, 0, offW, offH);
  off.globalCompositeOperation = "source-over";
  ctx.drawImage(scratch, 0, 0, w, h);
}

function loadImage(url) {
  if (!url) return Promise.resolve(null);
  const cached = imageCache.get(url);
  if (cached) return cached;

  const promise = new Promise((resolve) => {
    const finish = (img) => resolve(img && img.naturalWidth ? img : null);
    const start = (useCors) => {
      const img = new Image();
      if (useCors) img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.onload = () => {
        if (typeof img.decode === "function") {
          img.decode().then(() => finish(img)).catch(() => finish(img));
        } else {
          finish(img);
        }
      };
      img.onerror = () => {
        if (useCors) start(false);
        else finish(null);
      };
      img.src = url;
    };
    start(!url.startsWith("data:") && !url.startsWith("blob:"));
  });

  imageCache.set(url, promise);
  promise.then((img) => {
    if (!img) imageCache.delete(url);
  });
  return promise;
}

function hexToRgba(hex, alpha) {
  const value = String(hex || "#111111").replace("#", "");
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value.padEnd(6, "0");
  const n = Number.parseInt(full.slice(0, 6), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function displayText(object) {
  const raw = String(object.text ?? "");
  if (object.textTransform === "uppercase") return raw.toUpperCase();
  if (object.textTransform === "lowercase") return raw.toLowerCase();
  if (object.textTransform === "capitalize") {
    return raw.replace(/\S+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
  }
  return raw;
}

function applyFont(ctx, object) {
  ctx.font = `${object.fontStyle || "normal"} ${object.fontWeight || "normal"} ${object.fontSize || 32}px "${object.fontFamily || "Arial"}", Arial, sans-serif`;
}

function lineWidth(ctx, line, spacing) {
  const extra = Number(spacing) || 0;
  if (!line) return 8;
  if (!extra) return Math.max(8, ctx.measureText(line).width);
  let width = 0;
  for (let i = 0; i < line.length; i += 1) {
    width += ctx.measureText(line[i]).width;
    if (i < line.length - 1) width += extra;
  }
  return Math.max(8, width);
}

function measureText(ctx, object) {
  ctx.save();
  applyFont(ctx, object);
  const lines = displayText(object).split("\n");
  const spacing = Number(object.charSpacing) || 0;
  const fontSize = object.fontSize || 32;
  const width = Math.max(...lines.map((line) => lineWidth(ctx, line, spacing)), 8);
  const curve = Math.abs(Number(object.curve) || 0);
  const height =
    lines.length * fontSize * (object.lineHeight || 1.16) + (curve / 100) * width * 0.45;
  ctx.restore();
  return { width, height };
}

function drawLineGlyphs(ctx, line, y, object, boxWidth, mode) {
  const spacing = Number(object.charSpacing) || 0;
  const curve = Number(object.curve) || 0;
  const total = lineWidth(ctx, line, spacing);
  const align = object.textAlign || "left";
  let originX = 0;
  if (align === "center") originX = (boxWidth - total) / 2;
  if (align === "right") originX = boxWidth - total;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  if (Math.abs(curve) < 3) {
    let x = originX;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (mode === "stroke") ctx.strokeText(char, x, y);
      else ctx.fillText(char, x, y);
      x += ctx.measureText(char).width + spacing;
    }
    return;
  }

  const direction = curve >= 0 ? 1 : -1;
  const k = Math.min(1, Math.abs(curve) / 100);
  const radius = Math.max(total / Math.max(0.2, k * Math.PI), total * 0.55);
  const startAngle = -total / (2 * radius);
  let distance = 0;
  const centerX = boxWidth / 2;
  const centerY = y + fontSizeOffset(object) + direction * radius;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const width = ctx.measureText(char).width;
    const angle = startAngle + (distance + width / 2) / radius;
    const x = centerX + radius * Math.sin(angle);
    const gy = centerY - direction * radius * Math.cos(angle);
    ctx.save();
    ctx.translate(x, gy);
    ctx.rotate(angle);
    if (mode === "stroke") ctx.strokeText(char, 0, 0);
    else ctx.fillText(char, 0, 0);
    ctx.restore();
    distance += width + spacing;
  }
  ctx.restore();
}

function fontSizeOffset(object) {
  return (object.fontSize || 32) / 2;
}

function objectBounds(ctx, object) {
  if (object.type === "text") {
    const size = measureText(ctx, object);
    return {
      x: object.x,
      y: object.y,
      width: object.width || size.width,
      height: object.height || size.height,
    };
  }
  if (object.type === "namesNumbers") {
    return {
      x: object.x,
      y: object.y,
      width: object.width,
      height: object.height,
    };
  }
  return {
    x: object.x,
    y: object.y,
    width: object.width,
    height: object.height,
  };
}

function getHandles(box) {
  const { x, y, width: w, height: h } = box;
  return {
    nw: { x, y },
    n: { x: x + w / 2, y },
    ne: { x: x + w, y },
    e: { x: x + w, y: y + h / 2 },
    se: { x: x + w, y: y + h },
    s: { x: x + w / 2, y: y + h },
    sw: { x, y: y + h },
    w: { x, y: y + h / 2 },
  };
}

const HANDLE_CURSORS = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
};

function handleHitSize(canvas) {
  const displayScale = canvas.getBoundingClientRect().width / Math.max(1, canvas.width);
  return Math.max(14, 12 / displayScale);
}

function getRotateHandle(box, canvas) {
  const displayScale = canvas.getBoundingClientRect().width / Math.max(1, canvas.width);
  const offset = Math.max(28, 36 / displayScale);
  return { x: box.x + box.width / 2, y: box.y - offset };
}

function hitRotateHandle(box, x, y, canvas) {
  const pos = getRotateHandle(box, canvas);
  const radius = handleHitSize(canvas) * 0.7;
  const dx = x - pos.x;
  const dy = y - pos.y;
  return dx * dx + dy * dy <= radius * radius;
}

function angleFromCenter(cx, cy, x, y) {
  return (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
}

function normalizeAngle(value) {
  let angle = Number(value) || 0;
  angle %= 360;
  if (angle > 180) angle -= 360;
  if (angle < -180) angle += 360;
  return Math.round(angle);
}

function hitHandle(box, x, y, size) {
  const handles = getHandles(box);
  const names = Object.keys(handles);
  for (let i = 0; i < names.length; i += 1) {
    const name = names[i];
    const pos = handles[name];
    if (Math.abs(x - pos.x) <= size / 2 && Math.abs(y - pos.y) <= size / 2) {
      return name;
    }
  }
  return null;
}

function applyResize(object, handle, start, point) {
  const right = start.x + start.width;
  const bottom = start.y + start.height;
  let x = start.x;
  let y = start.y;
  let width = start.width;
  let height = start.height;
  const aspect = start.width / Math.max(1, start.height);
  const lockAspect = object.type !== "text" && (handle.length === 2 || handle === "nw" || handle === "ne" || handle === "se" || handle === "sw");

  if (handle.includes("e")) width = point.x - start.x;
  if (handle.includes("s")) height = point.y - start.y;
  if (handle.includes("w")) {
    x = point.x;
    width = right - point.x;
  }
  if (handle.includes("n")) {
    y = point.y;
    height = bottom - point.y;
  }

  if (lockAspect && handle.length === 2) {
    if (Math.abs(width / start.width) >= Math.abs(height / start.height)) {
      height = width / aspect;
      if (handle.includes("n")) y = bottom - height;
    } else {
      width = height * aspect;
      if (handle.includes("w")) x = right - width;
    }
  } else if (object.type !== "text" && (handle === "n" || handle === "s")) {
    width = height * aspect;
    x = start.x + (start.width - width) / 2;
  } else if (object.type !== "text" && (handle === "e" || handle === "w")) {
    height = width / aspect;
    y = start.y + (start.height - height) / 2;
  }

  if (width < 16) {
    if (handle.includes("w")) x = right - 16;
    width = 16;
  }
  if (height < 16) {
    if (handle.includes("n")) y = bottom - 16;
    height = 16;
  }

  object.x = x;
  object.y = y;
  object.width = width;
  object.height = height;
}

function hitTest(ctx, objects, x, y) {
  for (let i = objects.length - 1; i >= 0; i -= 1) {
    const object = objects[i];
    if (object.visible === false || object.locked) continue;
    const box = objectBounds(ctx, object);
    if (x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height) {
      return object;
    }
  }
  return null;
}

function toLayer(object) {
  return {
    id: object.id,
    name: object.name,
    type: object.type,
    visible: object.visible !== false,
    locked: Boolean(object.locked),
    text: object.text,
    fontFamily: object.fontFamily,
    fontSize: object.fontSize,
    fill: object.fill,
    stroke: object.stroke,
    strokeWidth: object.strokeWidth,
    fontWeight: object.fontWeight,
    fontStyle: object.fontStyle,
    underline: object.underline,
    linethrough: object.linethrough,
    textAlign: object.textAlign,
    textTransform: object.textTransform,
    charSpacing: object.charSpacing,
    lineHeight: object.lineHeight,
    opacity: object.opacity,
    curve: object.curve,
    shadowEnabled: object.shadowEnabled,
    shadowColor: object.shadowColor,
    shadowBlur: object.shadowBlur,
    shadowOffsetX: object.shadowOffsetX,
    shadowOffsetY: object.shadowOffsetY,
    flipX: object.flipX,
    flipY: object.flipY,
    angle: object.angle || 0,
    recolorable: object.recolorable !== false && object.type === "graphic",
  };
}

const NativeCustomizerCanvas = forwardRef(function NativeCustomizerCanvas(
  {
    width = 800,
    height = 800,
    backgroundImage,
    printArea,
    allowOverflow = false,
    productColor,
    colorMode = "tint",
    colorImageUrl,
    merchantMode = false,
    onSelectionChange,
    onLayersChange,
    onHistoryChange,
    onReady,
  },
  ref,
) {
  const canvasElRef = useRef(null);
  const stageRef = useRef(null);
  const objectsRef = useRef([]);
  const imagesRef = useRef(new Map());
  const backgroundRef = useRef(null);
  const colorImageRef = useRef(null);
  const selectedIdRef = useRef(null);
  const historyRef = useRef(createHistory());
  const skipHistoryRef = useRef(false);
  const dragRef = useRef(null);
  const printAreaRef = useRef(printArea);
  const zoomRef = useRef(1);
  const sizeRef = useRef({ width, height });
  const propsRef = useRef({ allowOverflow, merchantMode, productColor, colorMode });

  printAreaRef.current = printArea;
  sizeRef.current = { width, height };
  propsRef.current = { allowOverflow, merchantMode, productColor, colorMode };

  const snapshot = () =>
    JSON.stringify(objectsRef.current.map(({ image, ...rest }) => rest));

  const listenersRef = useRef({ onLayersChange, onSelectionChange, onHistoryChange });
  listenersRef.current = { onLayersChange, onSelectionChange, onHistoryChange };

  const emit = () => {
    const objects = objectsRef.current;
    listenersRef.current.onLayersChange?.(objects.map(toLayer).reverse());
    const selected = objects.find((item) => item.id === selectedIdRef.current) || null;
    listenersRef.current.onSelectionChange?.(selected ? toLayer(selected) : null);
    listenersRef.current.onHistoryChange?.({
      canUndo: historyRef.current.undoStack.length > 1,
      canRedo: historyRef.current.redoStack.length > 0,
    });
  };

  const commit = () => {
    if (skipHistoryRef.current) return;
    historyRef.current = pushHistory(historyRef.current, snapshot());
    emit();
  };

  const fitCanvas = () => {
    const canvas = canvasElRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const { width: logicalW, height: logicalH } = sizeRef.current;
    if (canvas.width !== logicalW) canvas.width = logicalW;
    if (canvas.height !== logicalH) canvas.height = logicalH;
    if (propsRef.current.merchantMode) {
      canvas.style.width = `${logicalW}px`;
      canvas.style.height = `${logicalH}px`;
    } else {
      const padding = 36;
      const stageW = Math.max(1, stage.clientWidth);
      const stageH = Math.max(1, stage.clientHeight);
      const scale =
        Math.min(
          Math.max(220, stageW - padding) / logicalW,
          Math.max(220, stageH - padding) / logicalH,
          1.05,
        ) * zoomRef.current;
      const nextW = `${Math.round(logicalW * scale)}px`;
      const nextH = `${Math.round(logicalH * scale)}px`;
      if (canvas.style.width !== nextW) canvas.style.width = nextW;
      if (canvas.style.height !== nextH) canvas.style.height = nextH;
    }
    draw();
  };

  const pointerToCanvas = (event) => {
    const canvas = canvasElRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const constrain = (object) => {
    if (propsRef.current.allowOverflow || propsRef.current.merchantMode) return;
    const area = printAreaRef.current;
    if (!area) return;
    const canvas = canvasElRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    const box = objectBounds(ctx, object);
    const maxX = area.x + Math.max(0, area.width - box.width);
    const maxY = area.y + Math.max(0, area.height - box.height);
    object.x = clamp(object.x, area.x, Math.max(area.x, maxX));
    object.y = clamp(object.y, area.y, Math.max(area.y, maxY));
  };

  const drawObject = (ctx, object) => {
    if (object.visible === false) return;
    const box = objectBounds(ctx, object);
    ctx.save();
    ctx.translate(box.x + box.width / 2, box.y + box.height / 2);
    ctx.rotate(((object.angle || 0) * Math.PI) / 180);
    ctx.scale(object.flipX ? -1 : 1, object.flipY ? -1 : 1);
    ctx.translate(-box.width / 2, -box.height / 2);
    ctx.globalAlpha = Math.max(0.05, Math.min(1, Number(object.opacity ?? 1)));
    if (object.type === "text") {
      const natural = measureText(ctx, object);
      ctx.scale(
        box.width / Math.max(1, natural.width),
        box.height / Math.max(1, natural.height),
      );
      applyFont(ctx, object);
      ctx.fillStyle = object.fill || "#111111";
      ctx.lineJoin = "round";
      ctx.miterLimit = 2;
      const lines = displayText(object).split("\n");
      const strokeWidth =
        object.strokeWidth == null
          ? Math.max(3, (object.fontSize || 32) / 10)
          : Number(object.strokeWidth) || 0;
      const stroke = object.stroke || "#ffffff";
      if (object.shadowEnabled) {
        ctx.shadowColor = object.shadowColor || "rgba(0,0,0,0.45)";
        ctx.shadowBlur = Number(object.shadowBlur) || 6;
        ctx.shadowOffsetX = Number(object.shadowOffsetX) || 2;
        ctx.shadowOffsetY = Number(object.shadowOffsetY) || 2;
      }
      lines.forEach((line, index) => {
        const y = index * (object.fontSize || 32) * (object.lineHeight || 1.16);
        if (strokeWidth > 0) {
          ctx.strokeStyle = stroke;
          ctx.lineWidth = strokeWidth;
          drawLineGlyphs(ctx, line, y, object, natural.width, "stroke");
        }
        drawLineGlyphs(ctx, line, y, object, natural.width, "fill");
      });
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      if ((object.underline || object.linethrough) && Math.abs(Number(object.curve) || 0) < 3) {
        ctx.strokeStyle = object.fill || "#111111";
        ctx.lineWidth = Math.max(1, (object.fontSize || 32) / 16);
        lines.forEach((line, index) => {
          const y = index * (object.fontSize || 32) * (object.lineHeight || 1.16);
          const width = lineWidth(ctx, line, Number(object.charSpacing) || 0);
          let x = 0;
          if (object.textAlign === "center") x = (natural.width - width) / 2;
          if (object.textAlign === "right") x = natural.width - width;
          ctx.beginPath();
          if (object.underline) {
            const uy = y + (object.fontSize || 32) * 0.92;
            ctx.moveTo(x, uy);
            ctx.lineTo(x + width, uy);
          }
          if (object.linethrough) {
            const sy = y + (object.fontSize || 32) * 0.52;
            ctx.moveTo(x, sy);
            ctx.lineTo(x + width, sy);
          }
          ctx.stroke();
        });
      }
    } else if (object.type === "namesNumbers") {
      ctx.fillStyle = object.fill || "#111111";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `bold ${object.fontSize || 28}px ${object.fontFamily || "Arial"}`;
      ctx.fillText(String(object.nameText || "NAME").toUpperCase(), box.width / 2, box.height * 0.32);
      ctx.font = `bold ${(object.fontSize || 28) * 1.8}px ${object.fontFamily || "Arial"}`;
      ctx.fillText(String(object.numberText || "10"), box.width / 2, box.height * 0.68);
    } else if (object.image) {
      const tint =
        object.recolorable !== false && object.type !== "qr" && object.type !== "upload"
          ? object.fill
          : null;
      drawGraphic(ctx, object.image, box.width, box.height, tint);
    }
    ctx.restore();

    if (object.id === selectedIdRef.current) {
      ctx.save();
      ctx.strokeStyle = "#0f766e";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(box.x - 2, box.y - 2, box.width + 4, box.height + 4);
      ctx.setLineDash([]);
      const canvas = canvasElRef.current;
      const size = canvas ? handleHitSize(canvas) : 12;
      const handles = getHandles(box);
      Object.values(handles).forEach((pos) => {
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#0f766e";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.rect(pos.x - size / 2, pos.y - size / 2, size, size);
        ctx.fill();
        ctx.stroke();
      });
      if (canvas) {
        const rotate = getRotateHandle(box, canvas);
        const stem = handles.n;
        ctx.strokeStyle = "#0f766e";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(stem.x, stem.y);
        ctx.lineTo(rotate.x, rotate.y);
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(rotate.x, rotate.y, size * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(rotate.x, rotate.y, size * 0.28, -Math.PI * 0.7, Math.PI * 0.85);
        ctx.stroke();
      }
      ctx.restore();
    }
  };

  const draw = () => {
    const canvas = canvasElRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const { width: w, height: h } = sizeRef.current;
    ctx.clearRect(0, 0, w, h);
    const productImage = colorImageRef.current || backgroundRef.current;
    if (productImage) {
      const scale = Math.min(w / productImage.width, h / productImage.height);
      const dw = productImage.width * scale;
      const dh = productImage.height * scale;
      const dx = (w - dw) / 2;
      const dy = (h - dh) / 2;
      ctx.drawImage(productImage, dx, dy, dw, dh);
      if (
        propsRef.current.colorMode === "tint" &&
        propsRef.current.productColor &&
        propsRef.current.productColor.toLowerCase() !== "#ffffff"
      ) {
        ctx.save();
        ctx.globalCompositeOperation = "multiply";
        ctx.fillStyle = hexToRgba(propsRef.current.productColor, 0.28);
        ctx.fillRect(dx, dy, dw, dh);
        ctx.restore();
      }
    }

    const area = printAreaRef.current;
    if (area) {
      ctx.save();
      ctx.strokeStyle = "#0f766e";
      ctx.fillStyle = "rgba(15, 118, 110, 0.04)";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 5]);
      ctx.fillRect(area.x, area.y, area.width, area.height);
      ctx.strokeRect(area.x, area.y, area.width, area.height);
      ctx.restore();
    }

    objectsRef.current.forEach((object) => drawObject(ctx, object));
  };

  const select = (object) => {
    selectedIdRef.current = object?.id || null;
    emit();
    draw();
  };

  const addObject = (object) => {
    const canvas = canvasElRef.current;
    if (!canvas) return null;
    const area = printAreaRef.current || { x: 80, y: 80, width: 400, height: 400 };
    const ctx = canvas.getContext("2d");
    const box = objectBounds(ctx, object);
    if (object.x == null) {
      object.x = area.x + Math.max(12, (area.width - (object.width || box.width)) / 2);
    }
    if (object.y == null) {
      object.y = area.y + Math.max(12, (area.height - (object.height || box.height)) / 2);
    }
    objectsRef.current = [...objectsRef.current, object];
    selectedIdRef.current = object.id;
    constrain(object);
    commit();
    draw();
    return object;
  };

  useEffect(() => {
    const canvas = canvasElRef.current;
    if (!canvas) return undefined;
    fitCanvas();
    historyRef.current = pushHistory(createHistory(), snapshot());
    emit();
    onReady?.(true);

    const onPointerDown = (event) => {
      const point = pointerToCanvas(event);
      const ctx = canvas.getContext("2d");
      if (propsRef.current.merchantMode && printAreaRef.current) {
        const area = printAreaRef.current;
        if (
          point.x >= area.x &&
          point.x <= area.x + area.width &&
          point.y >= area.y &&
          point.y <= area.y + area.height
        ) {
          dragRef.current = {
            kind: "printArea",
            dx: point.x - area.x,
            dy: point.y - area.y,
          };
          return;
        }
      }
      const selected = objectsRef.current.find((item) => item.id === selectedIdRef.current);
      if (selected && selected.locked !== true) {
        const bounds = objectBounds(ctx, selected);
        if (hitRotateHandle(bounds, point.x, point.y, canvas)) {
          event.preventDefault();
          const cx = bounds.x + bounds.width / 2;
          const cy = bounds.y + bounds.height / 2;
          dragRef.current = {
            kind: "rotate",
            id: selected.id,
            cx,
            cy,
            startAngle: Number(selected.angle) || 0,
            startPointer: angleFromCenter(cx, cy, point.x, point.y),
          };
          canvas.style.cursor = "grabbing";
          return;
        }
        const handle = hitHandle(
          bounds,
          point.x,
          point.y,
          handleHitSize(canvas),
        );
        if (handle) {
          event.preventDefault();
          dragRef.current = {
            kind: "resize",
            id: selected.id,
            handle,
            start: { ...objectBounds(ctx, selected) },
          };
          canvas.style.cursor = HANDLE_CURSORS[handle];
          return;
        }
      }
      const object = hitTest(ctx, objectsRef.current, point.x, point.y);
      select(object);
      if (!object || object.locked) return;
      dragRef.current = { kind: "object", id: object.id, dx: point.x - object.x, dy: point.y - object.y };
      canvas.style.cursor = "move";
    };
    const onPointerMove = (event) => {
      const point = pointerToCanvas(event);
      const ctx = canvas.getContext("2d");
      const drag = dragRef.current;
      if (!drag) {
        const selected = objectsRef.current.find((item) => item.id === selectedIdRef.current);
        if (selected && selected.locked !== true) {
          const bounds = objectBounds(ctx, selected);
          if (hitRotateHandle(bounds, point.x, point.y, canvas)) {
            canvas.style.cursor = "grab";
          } else {
            const handle = hitHandle(
              bounds,
              point.x,
              point.y,
              handleHitSize(canvas),
            );
            canvas.style.cursor = handle ? HANDLE_CURSORS[handle] : "default";
          }
        } else {
          canvas.style.cursor = "default";
        }
        return;
      }
      if (drag.kind === "printArea" && printAreaRef.current) {
        printAreaRef.current = {
          ...printAreaRef.current,
          x: point.x - drag.dx,
          y: point.y - drag.dy,
        };
        draw();
        return;
      }
      const object = objectsRef.current.find((item) => item.id === drag.id);
      if (!object || object.locked) return;
      if (drag.kind === "rotate") {
        const pointer = angleFromCenter(drag.cx, drag.cy, point.x, point.y);
        object.angle = normalizeAngle(drag.startAngle + (pointer - drag.startPointer));
        emit();
        draw();
        return;
      }
      if (drag.kind === "resize") {
        applyResize(object, drag.handle, drag.start, point);
        constrain(object);
        emit();
        draw();
        return;
      }
      object.x = point.x - drag.dx;
      object.y = point.y - drag.dy;
      constrain(object);
      draw();
    };
    const onPointerUp = () => {
      if (dragRef.current) commit();
      dragRef.current = null;
      canvas.style.cursor = "default";
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            fitCanvas();
          })
        : null;
    if (stageRef.current) observer?.observe(stageRef.current);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      observer?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fitCanvas();
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, printArea, allowOverflow, merchantMode, productColor, colorMode]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadImage(backgroundImage), loadImage(colorImageUrl)]).then(([background, colorImage]) => {
      if (cancelled) return;
      if (background) backgroundRef.current = background;
      if (colorImageUrl) {
        if (colorImage) colorImageRef.current = colorImage;
      } else {
        colorImageRef.current = null;
      }
      fitCanvas();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundImage, colorImageUrl]);

  useImperativeHandle(ref, () => ({
    addText(options = {}) {
      const canvas = canvasElRef.current;
      if (!canvas) return null;
      const ctx = canvas.getContext("2d");
      const object = {
        id: uid(),
        type: "text",
        name: options.name || nextObjectName(objectsRef.current, "Text"),
        text: options.text || "Your text",
        fontFamily: options.fontFamily || "Arial",
        fontSize: options.fontSize || 32,
        fill: options.fill || "#111111",
        stroke: options.stroke || "#ffffff",
        strokeWidth: options.strokeWidth == null ? 3 : Number(options.strokeWidth) || 0,
        fontWeight: options.fontWeight || "normal",
        fontStyle: options.fontStyle || "normal",
        underline: Boolean(options.underline),
        linethrough: Boolean(options.linethrough),
        textAlign: options.textAlign || "left",
        textTransform: options.textTransform || "none",
        charSpacing: Number(options.charSpacing) || 0,
        lineHeight: Number(options.lineHeight) || 1.16,
        opacity: options.opacity == null ? 1 : Number(options.opacity),
        curve: Number(options.curve) || 0,
        shadowEnabled: Boolean(options.shadowEnabled),
        shadowColor: options.shadowColor || "#000000",
        shadowBlur: Number(options.shadowBlur) || 6,
        shadowOffsetX: Number(options.shadowOffsetX) || 2,
        shadowOffsetY: Number(options.shadowOffsetY) || 2,
        flipX: Boolean(options.flipX),
        flipY: Boolean(options.flipY),
        angle: Number(options.angle) || 0,
        visible: true,
        locked: false,
      };
      const size = measureText(ctx, object);
      object.width = options.width || size.width;
      object.height = options.height || size.height;
      const area = printAreaRef.current;
      if (options.x != null) object.x = options.x;
      else if (area) object.x = area.x + Math.max(0, (area.width - object.width) / 2);
      if (options.y != null) object.y = options.y;
      return addObject(object);
    },
    async addImage(url, options = {}) {
      const image = await loadImage(url);
      if (!image) return null;
      const area = printAreaRef.current || { width: 300, height: 300 };
      const maxWidth = Math.min(220, area.width * 0.6);
      const scale = maxWidth / (image.width || maxWidth);
      const object = {
        id: uid(),
        type: options.customType || "image",
        name: options.name || nextObjectName(objectsRef.current, "Image"),
        url,
        image,
        width: image.width * scale,
        height: image.height * scale,
        angle: 0,
        opacity: options.opacity == null ? 1 : Number(options.opacity),
        flipX: Boolean(options.flipX),
        flipY: Boolean(options.flipY),
        fill: options.fill || null,
        recolorable: options.recolorable !== false && (options.customType || "image") === "graphic",
        visible: true,
        locked: false,
      };
      imagesRef.current.set(object.id, image);
      if (options.x != null) object.x = options.x;
      if (options.y != null) object.y = options.y;
      return addObject(object);
    },
    async addQrCode({ value, kind = "url" } = {}) {
      const dataUrl = await QRCode.toDataURL(value || "https://example.com", { width: 512, margin: 1 });
      return this.addImage(dataUrl, { customType: "qr", name: `QR ${kind}` });
    },
    addNamesNumbers({
      name = "NAME",
      number = "10",
      fill = "#111111",
      fontFamily = "Arial",
      fontSize = 28,
    } = {}) {
      return addObject({
        id: uid(),
        type: "namesNumbers",
        name: `${name} #${number}`,
        nameText: name,
        numberText: number,
        fill,
        fontFamily,
        fontSize,
        opacity: 1,
        width: Math.max(160, String(name).length * fontSize * 0.7),
        height: fontSize * 3.2,
        angle: 0,
        visible: true,
        locked: false,
      });
    },
    deleteActive() {
      const id = selectedIdRef.current;
      if (!id) return;
      objectsRef.current = objectsRef.current.filter((item) => item.id !== id);
      selectedIdRef.current = null;
      commit();
      draw();
    },
    duplicateActive() {
      const object = objectsRef.current.find((item) => item.id === selectedIdRef.current);
      if (!object) return;
      const copy = { ...object, id: uid(), x: object.x + 16, y: object.y + 16, name: `${object.name} copy` };
      return addObject(copy);
    },
    updateActive(props) {
      const object = objectsRef.current.find((item) => item.id === selectedIdRef.current);
      if (!object) return;
      const layoutKeys = [
        "text",
        "fontSize",
        "fontFamily",
        "fontWeight",
        "fontStyle",
        "charSpacing",
        "lineHeight",
        "textTransform",
        "curve",
      ];
      const layoutChanged =
        object.type === "text" &&
        layoutKeys.some((key) => Object.prototype.hasOwnProperty.call(props, key) && props[key] !== object[key]);
      let scaleX = 1;
      let scaleY = 1;
      const ctx = canvasElRef.current?.getContext("2d");
      if (layoutChanged && ctx) {
        const before = measureText(ctx, object);
        scaleX = (object.width || before.width) / Math.max(1, before.width);
        scaleY = (object.height || before.height) / Math.max(1, before.height);
      }
      Object.assign(object, props);
      if (layoutChanged && ctx) {
        const after = measureText(ctx, object);
        object.width = after.width * scaleX;
        object.height = after.height * scaleY;
      }
      emit();
      draw();
    },
    align(direction) {
      const object = objectsRef.current.find((item) => item.id === selectedIdRef.current);
      const area = printAreaRef.current;
      const canvas = canvasElRef.current;
      if (!object || !area || !canvas) return;
      const box = objectBounds(canvas.getContext("2d"), object);
      if (direction === "left") object.x = area.x;
      if (direction === "right") object.x = area.x + area.width - box.width;
      if (direction === "center") object.x = area.x + (area.width - box.width) / 2;
      if (direction === "top") object.y = area.y;
      if (direction === "middle") object.y = area.y + (area.height - box.height) / 2;
      commit();
      draw();
    },
    layer(action, layerId) {
      const objects = [...objectsRef.current];
      const index = objects.findIndex((item) => item.id === (layerId || selectedIdRef.current));
      if (index < 0) return;
      const [item] = objects.splice(index, 1);
      if (action === "up") objects.splice(Math.min(objects.length, index + 1), 0, item);
      if (action === "down") objects.splice(Math.max(0, index - 1), 0, item);
      if (action === "front") objects.push(item);
      if (action === "back") objects.unshift(item);
      objectsRef.current = objects;
      commit();
      draw();
    },
    toggleLock(layerId) {
      const object = objectsRef.current.find((item) => item.id === (layerId || selectedIdRef.current));
      if (!object) return;
      object.locked = !object.locked;
      commit();
      draw();
    },
    toggleVisible(layerId) {
      const object = objectsRef.current.find((item) => item.id === layerId);
      if (!object) return;
      object.visible = object.visible === false;
      commit();
      draw();
    },
    selectLayer(layerId) {
      const object = objectsRef.current.find((item) => item.id === layerId);
      select(object || null);
    },
    deleteLayer(layerId) {
      objectsRef.current = objectsRef.current.filter((item) => item.id !== layerId);
      if (selectedIdRef.current === layerId) selectedIdRef.current = null;
      commit();
      draw();
    },
    undo() {
      const result = undoHistory(historyRef.current);
      historyRef.current = result.history;
      if (!result.snapshot) return;
      skipHistoryRef.current = true;
      objectsRef.current = JSON.parse(result.snapshot);
      skipHistoryRef.current = false;
      emit();
      restoreImages().then(draw);
    },
    redo() {
      const result = redoHistory(historyRef.current);
      historyRef.current = result.history;
      if (!result.snapshot) return;
      skipHistoryRef.current = true;
      objectsRef.current = JSON.parse(result.snapshot);
      skipHistoryRef.current = false;
      emit();
      restoreImages().then(draw);
    },
    zoom(level) {
      zoomRef.current = clamp(level, 0.4, 2.5);
      fitCanvas();
    },
    getZoom() {
      return zoomRef.current;
    },
    getJSON() {
      return {
        objects: objectsRef.current.map((object) => ({
          ...object,
          image: undefined,
        })),
      };
    },
    async loadJSON(json) {
      objectsRef.current = Array.isArray(json?.objects) ? json.objects.map((object) => ({ ...object })) : [];
      selectedIdRef.current = null;
      await restoreImages();
      historyRef.current = pushHistory(createHistory(), snapshot());
      emit();
      draw();
    },
    getPrintArea() {
      return printAreaRef.current;
    },
    async exportPreview() {
      draw();
      return canvasElRef.current.toDataURL("image/png");
    },
    async exportPrintFile({ dpi = 300 } = {}) {
      const area = printAreaRef.current;
      const source = canvasElRef.current;
      if (!area || !source) return null;
      const scale = Math.max(1, dpi / 72);
      const out = document.createElement("canvas");
      out.width = Math.max(1, area.width * scale);
      out.height = Math.max(1, area.height * scale);
      const ctx = out.getContext("2d");
      ctx.drawImage(source, area.x, area.y, area.width, area.height, 0, 0, out.width, out.height);
      return out.toDataURL("image/png");
    },
    getActive() {
      return objectsRef.current.find((item) => item.id === selectedIdRef.current) || null;
    },
    nudgeActive(dx, dy) {
      const object = objectsRef.current.find((item) => item.id === selectedIdRef.current);
      if (!object || object.locked || object.visible === false) return false;
      object.x = (Number(object.x) || 0) + dx;
      object.y = (Number(object.y) || 0) + dy;
      constrain(object);
      draw();
      return true;
    },
    commitNudge() {
      commit();
      draw();
    },
    redraw() {
      draw();
    },
  }), []);

  async function restoreImages() {
    await Promise.all(
      objectsRef.current.map(async (object) => {
        if (object.url && !object.image) {
          object.image = await loadImage(object.url);
        }
      }),
    );
  }

  return (
    <div className="canvas-stage" ref={stageRef}>
      <div className="canvas-frame">
        {(colorImageUrl || backgroundImage) ? (
          <img
            className="canvas-product-fallback"
            src={colorImageUrl || backgroundImage}
            alt=""
          />
        ) : null}
        <canvas ref={canvasElRef} width={width} height={height} />
      </div>
    </div>
  );
});

export default NativeCustomizerCanvas;
