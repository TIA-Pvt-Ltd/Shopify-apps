import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  Canvas,
  FabricImage,
  FabricText,
  Group,
  IText,
  Line,
  Rect,
} from "fabric";
import QRCode from "qrcode";
import { createHistory, pushHistory, redoHistory, undoHistory } from "./history";
import { nextObjectName, OBJECT_PROPS, serializeObject } from "./objects";

const JSON_PROPS = OBJECT_PROPS;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const CustomizerCanvasClient = forwardRef(function CustomizerCanvasClient(
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
  const canvasRef = useRef(null);
  const zoomRef = useRef(1);
  const sizeRef = useRef({ width, height });
  sizeRef.current = { width, height };
  const overlayRef = useRef(null);
  const backgroundRef = useRef(null);
  const colorOverlayRef = useRef(null);
  const guidesRef = useRef([]);
  const historyRef = useRef(createHistory());
  const skipHistoryRef = useRef(false);
  const printAreaRef = useRef(printArea);
  const allowOverflowRef = useRef(allowOverflow);
  const merchantModeRef = useRef(merchantMode);

  printAreaRef.current = printArea;
  allowOverflowRef.current = allowOverflow;
  merchantModeRef.current = merchantMode;

  const emitLayers = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const layers = canvas
      .getObjects()
      .filter((object) => !object.excludeFromExport && object.customType !== "guide")
      .map(serializeObject)
      .reverse();
    onLayersChange?.(layers);
    onHistoryChange?.({
      canUndo: historyRef.current.undoStack.length > 1,
      canRedo: historyRef.current.redoStack.length > 0,
    });
  };

  const snapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return JSON.stringify(canvas.toJSON(JSON_PROPS));
  };

  const commitHistory = () => {
    if (skipHistoryRef.current) return;
    historyRef.current = pushHistory(historyRef.current, snapshot());
    emitLayers();
  };

  const applyPrintAreaOverlay = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const area = printAreaRef.current;
    if (overlayRef.current) {
      canvas.remove(overlayRef.current);
      overlayRef.current = null;
    }
    if (!area) return;
    const rect = new Rect({
      left: area.x,
      top: area.y,
      width: area.width,
      height: area.height,
      angle: area.rotation || 0,
      fill: "rgba(15, 118, 110, 0.04)",
      stroke: "#0f766e",
      strokeDashArray: [8, 5],
      strokeWidth: 2,
      selectable: merchantMode,
      evented: merchantMode,
      hasBorders: true,
      hasControls: merchantMode,
      lockRotation: Boolean(area.locked),
      lockMovementX: Boolean(area.locked),
      lockMovementY: Boolean(area.locked),
      lockScalingX: Boolean(area.locked),
      lockScalingY: Boolean(area.locked),
      excludeFromExport: true,
      customType: "printArea",
      name: "Print area",
    });
    overlayRef.current = rect;
    canvas.add(rect);
    canvas.moveObjectTo(rect, 1);
    if (!allowOverflowRef.current && !merchantMode) {
      canvas.clipPath = new Rect({
        left: area.x,
        top: area.y,
        width: area.width,
        height: area.height,
        absolutePositioned: true,
      });
    } else {
      canvas.clipPath = undefined;
    }
  };

  const constrainObject = (object) => {
    if (allowOverflowRef.current || merchantMode) return;
    const area = printAreaRef.current;
    if (!area || !object || object.excludeFromExport) return;
    const bound = object.getBoundingRect();
    let left = object.left || 0;
    let top = object.top || 0;
    if (bound.left < area.x) left += area.x - bound.left;
    if (bound.top < area.y) top += area.y - bound.top;
    if (bound.left + bound.width > area.x + area.width) {
      left -= bound.left + bound.width - (area.x + area.width);
    }
    if (bound.top + bound.height > area.y + area.height) {
      top -= bound.top + bound.height - (area.y + area.height);
    }
    object.set({ left, top });
    object.setCoords();
  };

  const clearGuides = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    guidesRef.current.forEach((line) => canvas.remove(line));
    guidesRef.current = [];
  };

  const snapObject = (object) => {
    const canvas = canvasRef.current;
    if (!canvas || !object) return;
    clearGuides();
    const area = printAreaRef.current;
    const centerX = area ? area.x + area.width / 2 : canvas.getWidth() / 2;
    const centerY = area ? area.y + area.height / 2 : canvas.getHeight() / 2;
    const objCenter = object.getCenterPoint();
    const threshold = 8;
    if (Math.abs(objCenter.x - centerX) < threshold) {
      object.set({ left: object.left + (centerX - objCenter.x) });
      const line = new Line([centerX, 0, centerX, canvas.getHeight()], {
        stroke: "#f97316",
        strokeWidth: 1,
        selectable: false,
        evented: false,
        excludeFromExport: true,
        customType: "guide",
      });
      canvas.add(line);
      guidesRef.current.push(line);
    }
    if (Math.abs(objCenter.y - centerY) < threshold) {
      object.set({ top: object.top + (centerY - objCenter.y) });
      const line = new Line([0, centerY, canvas.getWidth(), centerY], {
        stroke: "#f97316",
        strokeWidth: 1,
        selectable: false,
        evented: false,
        excludeFromExport: true,
        customType: "guide",
      });
      canvas.add(line);
      guidesRef.current.push(line);
    }
    object.setCoords();
  };

  const setBackground = async (url, tintColor) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (backgroundRef.current) {
      canvas.remove(backgroundRef.current);
      backgroundRef.current = null;
    }
    if (colorOverlayRef.current) {
      canvas.remove(colorOverlayRef.current);
      colorOverlayRef.current = null;
    }
    if (!url) {
      canvas.requestRenderAll();
      return;
    }
    const image = await FabricImage.fromURL(url, { crossOrigin: "anonymous" });
    const scale = Math.min(
      canvas.getWidth() / (image.width || 1),
      canvas.getHeight() / (image.height || 1),
    );
    image.set({
      left: 0,
      top: 0,
      scaleX: scale,
      scaleY: scale,
      selectable: false,
      evented: false,
      excludeFromExport: false,
      customType: "background",
      name: "Background",
    });
    canvas.add(image);
    canvas.moveObjectTo(image, 0);
    backgroundRef.current = image;

    if (colorMode === "tint" && tintColor && tintColor.toLowerCase() !== "#ffffff") {
      const overlay = new Rect({
        left: 0,
        top: 0,
        width: canvas.getWidth(),
        height: canvas.getHeight(),
        fill: tintColor,
        opacity: 0.28,
        selectable: false,
        evented: false,
        excludeFromExport: false,
        globalCompositeOperation: "multiply",
        customType: "colorOverlay",
        name: "Color",
      });
      canvas.add(overlay);
      canvas.moveObjectTo(overlay, 1);
      colorOverlayRef.current = overlay;
    }
    applyPrintAreaOverlay();
    canvas.requestRenderAll();
  };

  useEffect(() => {
    const element = canvasElRef.current;
    if (!element) return undefined;
    const canvas = new Canvas(element, {
      width,
      height,
      preserveObjectStacking: true,
      selection: true,
      backgroundColor: "#f8fafc",
    });
    canvasRef.current = canvas;
    historyRef.current = createHistory();

    const handleSelected = () => {
      const object = canvas.getActiveObject();
      onSelectionChange?.(object ? serializeObject(object) : null);
    };
    const handleCleared = () => onSelectionChange?.(null);
    const handleModified = (event) => {
      constrainObject(event.target);
      clearGuides();
      commitHistory();
    };
    const handleMoving = (event) => {
      snapObject(event.target);
      constrainObject(event.target);
    };

    canvas.on("selection:created", handleSelected);
    canvas.on("selection:updated", handleSelected);
    canvas.on("selection:cleared", handleCleared);
    canvas.on("object:modified", handleModified);
    canvas.on("object:moving", handleMoving);
    canvas.on("text:changed", handleSelected);
    canvas.on("object:scaling", (event) => constrainObject(event.target));
    canvas.on("object:rotating", (event) => constrainObject(event.target));

    historyRef.current = pushHistory(createHistory(), snapshot());
    emitLayers();
    onReady?.();

    const stage = stageRef.current;
    const resize = () => fitToStage();
    const observer = stage && typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    observer?.observe(stage);
    resize();

    return () => {
      observer?.disconnect();
      canvas.off("selection:created", handleSelected);
      canvas.off("selection:updated", handleSelected);
      canvas.off("selection:cleared", handleCleared);
      canvas.off("object:modified", handleModified);
      canvas.off("object:moving", handleMoving);
      canvas.off("text:changed", handleSelected);
      canvas.dispose();
      canvasRef.current = null;
    };
    // Canvas is created once per mount; size updates happen below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fitToStage = () => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage || merchantModeRef.current) return;
    const padding = 36;
    const maxW = Math.max(220, stage.clientWidth - padding);
    const maxH = Math.max(220, stage.clientHeight - padding);
    const { width: logicalWidth, height: logicalHeight } = sizeRef.current;
    const scale =
      Math.min(maxW / logicalWidth, maxH / logicalHeight, 1.05) * zoomRef.current;
    canvas.setDimensions(
      {
        width: `${Math.round(logicalWidth * scale)}px`,
        height: `${Math.round(logicalHeight * scale)}px`,
      },
      { cssOnly: true },
    );
    canvas.requestRenderAll();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setDimensions({ width, height });
    fitToStage();
    canvas.requestRenderAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  useEffect(() => {
    const image = colorImageUrl || backgroundImage;
    setBackground(image, productColor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundImage, colorImageUrl, productColor, colorMode]);

  useEffect(() => {
    applyPrintAreaOverlay();
    canvasRef.current?.requestRenderAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printArea, allowOverflow, merchantMode]);

  const addDesignObject = (object) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const area = printAreaRef.current || { x: 80, y: 80, width: 400, height: 400 };
    if (object.left == null) object.set({ left: area.x + 24 });
    if (object.top == null) object.set({ top: area.y + 24 });
    canvas.add(object);
    canvas.setActiveObject(object);
    constrainObject(object);
    canvas.requestRenderAll();
    commitHistory();
    return object;
  };

  useImperativeHandle(ref, () => ({
    addText(options = {}) {
      const canvas = canvasRef.current;
      const text = new IText(options.text || "Your text", {
        fontFamily: options.fontFamily || "Arial",
        fontSize: options.fontSize || 32,
        fill: options.fill || "#111111",
        stroke: options.stroke || "#ffffff",
        strokeWidth: options.strokeWidth == null ? 3 : Number(options.strokeWidth) || 0,
        paintFirst: "stroke",
        fontWeight: options.fontWeight || "normal",
        fontStyle: options.fontStyle || "normal",
        underline: Boolean(options.underline),
        linethrough: Boolean(options.linethrough),
        opacity: options.opacity == null ? 1 : Number(options.opacity),
        flipX: Boolean(options.flipX),
        flipY: Boolean(options.flipY),
        shadow: options.shadowEnabled
          ? {
              color: options.shadowColor || "rgba(0,0,0,0.45)",
              blur: Number(options.shadowBlur) || 6,
              offsetX: Number(options.shadowOffsetX) || 2,
              offsetY: Number(options.shadowOffsetY) || 2,
            }
          : null,
        textAlign: options.textAlign || "left",
        charSpacing: Number(options.charSpacing) || 0,
        lineHeight: Number(options.lineHeight) || 1.16,
        angle: Number(options.angle) || 0,
        customType: "text",
        name: options.name || nextObjectName(canvas?.getObjects() || [], "Text"),
        id: crypto.randomUUID(),
      });
      return addDesignObject(text);
    },
    async addImage(url, options = {}) {
      const canvas = canvasRef.current;
      const image = await FabricImage.fromURL(url, { crossOrigin: "anonymous" });
      const area = printAreaRef.current || { width: 300, height: 300 };
      const maxWidth = Math.min(220, area.width * 0.6);
      const scale = maxWidth / (image.width || maxWidth);
      image.set({
        scaleX: scale,
        scaleY: scale,
        customType: options.customType || "image",
        name: options.name || nextObjectName(canvas?.getObjects() || [], "Image"),
        id: crypto.randomUUID(),
      });
      return addDesignObject(image);
    },
    async addQrCode({ value, kind = "url" }) {
      const content = value || "https://example.com";
      const dataUrl = await QRCode.toDataURL(content, { width: 512, margin: 1 });
      return this.addImage(dataUrl, {
        customType: "qr",
        name: `QR ${kind}`,
      });
    },
    addNamesNumbers({ name = "NAME", number = "10", fill = "#111111", fontFamily = "Arial", fontSize = 28 } = {}) {
      const nameText = new FabricText(String(name).toUpperCase(), {
        fontFamily,
        fontSize,
        fill,
        fontWeight: "bold",
        originX: "center",
        originY: "center",
        top: -24,
      });
      const numberText = new FabricText(String(number), {
        fontFamily,
        fontSize: fontSize * 1.8,
        fill,
        fontWeight: "bold",
        originX: "center",
        originY: "center",
        top: 28,
      });
      const group = new Group([nameText, numberText], {
        customType: "namesNumbers",
        name: `${name} #${number}`,
        id: crypto.randomUUID(),
      });
      return addDesignObject(group);
    },
    deleteActive() {
      const canvas = canvasRef.current;
      const object = canvas?.getActiveObject();
      if (!canvas || !object || object.customType === "printArea") return;
      canvas.remove(object);
      canvas.discardActiveObject();
      canvas.requestRenderAll();
      commitHistory();
    },
    duplicateActive() {
      const canvas = canvasRef.current;
      const object = canvas?.getActiveObject();
      if (!canvas || !object || object.excludeFromExport) return;
      object.clone(JSON_PROPS).then((cloned) => {
        cloned.set({
          left: (object.left || 0) + 16,
          top: (object.top || 0) + 16,
          id: crypto.randomUUID(),
          name: `${object.name || "Layer"} copy`,
          customType: object.customType,
        });
        addDesignObject(cloned);
      });
    },
    updateActive(props) {
      const canvas = canvasRef.current;
      const object = canvas?.getActiveObject();
      if (!canvas || !object || object.excludeFromExport) return;
      object.set(props);
      canvas.requestRenderAll();
      emitLayers();
    },
    align(direction) {
      const canvas = canvasRef.current;
      const object = canvas?.getActiveObject();
      const area = printAreaRef.current;
      if (!canvas || !object || !area) return;
      const bound = object.getBoundingRect();
      if (direction === "left") object.set({ left: object.left + (area.x - bound.left) });
      if (direction === "right") {
        object.set({ left: object.left + (area.x + area.width - (bound.left + bound.width)) });
      }
      if (direction === "center") {
        object.set({ left: object.left + (area.x + area.width / 2 - (bound.left + bound.width / 2)) });
      }
      if (direction === "top") object.set({ top: object.top + (area.y - bound.top) });
      if (direction === "middle") {
        object.set({ top: object.top + (area.y + area.height / 2 - (bound.top + bound.height / 2)) });
      }
      object.setCoords();
      canvas.requestRenderAll();
      commitHistory();
    },
    layer(action, layerId) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const object =
        canvas.getObjects().find((item) => item.id === layerId) || canvas.getActiveObject();
      if (!object) return;
      if (action === "up") canvas.bringObjectForward(object);
      if (action === "down") canvas.sendObjectBackwards(object);
      if (action === "front") canvas.bringObjectToFront(object);
      if (action === "back") canvas.sendObjectToBack(object);
      if (backgroundRef.current) canvas.sendObjectToBack(backgroundRef.current);
      if (colorOverlayRef.current) canvas.moveObjectTo(colorOverlayRef.current, 1);
      if (overlayRef.current) canvas.bringObjectToFront(overlayRef.current);
      canvas.requestRenderAll();
      commitHistory();
    },
    toggleLock(layerId) {
      const canvas = canvasRef.current;
      const object = canvas?.getObjects().find((item) => item.id === layerId) || canvas?.getActiveObject();
      if (!canvas || !object) return;
      const locked = !object.locked;
      object.set({
        locked,
        selectable: !locked,
        evented: !locked,
      });
      canvas.requestRenderAll();
      commitHistory();
    },
    toggleVisible(layerId) {
      const canvas = canvasRef.current;
      const object = canvas?.getObjects().find((item) => item.id === layerId);
      if (!canvas || !object) return;
      object.set({ visible: object.visible === false });
      canvas.requestRenderAll();
      commitHistory();
    },
    selectLayer(layerId) {
      const canvas = canvasRef.current;
      const object = canvas?.getObjects().find((item) => item.id === layerId);
      if (!canvas || !object) return;
      canvas.setActiveObject(object);
      canvas.requestRenderAll();
    },
    deleteLayer(layerId) {
      const canvas = canvasRef.current;
      const object = canvas?.getObjects().find((item) => item.id === layerId);
      if (!canvas || !object || object.customType === "background") return;
      canvas.remove(object);
      canvas.requestRenderAll();
      commitHistory();
    },
    undo() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const result = undoHistory(historyRef.current);
      historyRef.current = result.history;
      if (!result.snapshot) return;
      skipHistoryRef.current = true;
      canvas.loadFromJSON(JSON.parse(result.snapshot)).then(() => {
        skipHistoryRef.current = false;
        canvas.requestRenderAll();
        emitLayers();
      });
    },
    redo() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const result = redoHistory(historyRef.current);
      historyRef.current = result.history;
      if (!result.snapshot) return;
      skipHistoryRef.current = true;
      canvas.loadFromJSON(JSON.parse(result.snapshot)).then(() => {
        skipHistoryRef.current = false;
        canvas.requestRenderAll();
        emitLayers();
      });
    },
    zoom(level) {
      zoomRef.current = clamp(level, 0.4, 2.5);
      fitToStage();
    },
    getZoom() {
      return canvasRef.current?.getZoom() || 1;
    },
    getJSON() {
      return canvasRef.current?.toJSON(JSON_PROPS) || { objects: [] };
    },
    async loadJSON(json) {
      const canvas = canvasRef.current;
      if (!canvas || !json) return;
      skipHistoryRef.current = true;
      await canvas.loadFromJSON(json);
      skipHistoryRef.current = false;
      applyPrintAreaOverlay();
      canvas.requestRenderAll();
      historyRef.current = pushHistory(createHistory(), snapshot());
      emitLayers();
    },
    getPrintArea() {
      const overlay = overlayRef.current;
      if (!overlay) return printAreaRef.current;
      return {
        x: overlay.left,
        y: overlay.top,
        width: overlay.getScaledWidth(),
        height: overlay.getScaledHeight(),
        rotation: overlay.angle || 0,
        locked: Boolean(overlay.lockMovementX),
      };
    },
    async exportPreview() {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const hidden = [];
      canvas.getObjects().forEach((object) => {
        if (object.customType === "printArea" || object.customType === "guide") {
          hidden.push({ object, visible: object.visible });
          object.visible = false;
        }
      });
      const previousBackground = canvas.backgroundColor;
      canvas.backgroundColor = "transparent";
      const background = backgroundRef.current;
      const dataUrl = background
        ? canvas.toDataURL({
            format: "png",
            left: background.left || 0,
            top: background.top || 0,
            width: background.getScaledWidth(),
            height: background.getScaledHeight(),
            multiplier: 1,
          })
        : canvas.toDataURL({ format: "png", multiplier: 1 });
      canvas.backgroundColor = previousBackground;
      hidden.forEach(({ object, visible }) => {
        object.visible = visible;
      });
      canvas.requestRenderAll();
      return dataUrl;
    },
    async exportPrintFile({ dpi = 300 } = {}) {
      const canvas = canvasRef.current;
      const area = printAreaRef.current;
      if (!canvas || !area) return null;
      const hidden = [];
      canvas.getObjects().forEach((object) => {
        if (object.customType === "background" || object.customType === "colorOverlay" || object.customType === "printArea" || object.customType === "guide") {
          hidden.push({ object, visible: object.visible });
          object.visible = false;
        }
      });
      const multiplier = Math.max(1, dpi / 72);
      const dataUrl = canvas.toDataURL({
        format: "png",
        left: area.x,
        top: area.y,
        width: area.width,
        height: area.height,
        multiplier,
      });
      hidden.forEach(({ object, visible }) => {
        object.visible = visible;
      });
      canvas.requestRenderAll();
      return dataUrl;
    },
    getActive() {
      return canvasRef.current?.getActiveObject() || null;
    },
  }));

  return (
    <div className="canvas-stage" ref={stageRef}>
      <div className="canvas-frame">
        <canvas ref={canvasElRef} />
      </div>
    </div>
  );
});

export default CustomizerCanvasClient;
