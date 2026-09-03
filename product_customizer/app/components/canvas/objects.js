export const OBJECT_PROPS = [
  "id",
  "name",
  "customType",
  "locked",
  "hidden",
  "selectable",
  "evented",
];

export function nextObjectName(objects, prefix) {
  const count = objects.filter((object) =>
    String(object.name || "").startsWith(prefix),
  ).length;
  return `${prefix} ${count + 1}`;
}

export function serializeObject(object) {
  return {
    id: object.id,
    name: object.name || object.customType || "Layer",
    type: object.customType || object.type,
    visible: object.visible !== false,
    locked: Boolean(object.locked) || object.selectable === false,
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
    angle: object.angle,
  };
}
