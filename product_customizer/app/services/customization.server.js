import prisma from "../db.server";
import { createCustomizationPublicId } from "../utils/customization-id";
import { getStorage, absoluteAssetUrl, servePublicUpload } from "./storage.server";
import { parseShopDomain, toGid } from "../utils/gid";

function serializeCustomization(row, appUrl) {
  if (!row) return null;
  return {
    id: row.id,
    publicId: row.publicId,
    storeId: row.storeId,
    shopifyProductId: row.shopifyProductId,
    shopifyVariantId: row.shopifyVariantId,
    customerId: row.customerId,
    configuration: row.configuration,
    previewUrl: absoluteAssetUrl(row.previewUrl, appUrl),
    printFileUrl: absoluteAssetUrl(row.printFileUrl, appUrl),
    quantity: row.quantity,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function storeDataUrl(storeId, folder, dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|svg\+xml));base64,(.+)$/);
  if (!match) return null;
  const mime = match[1];
  const buffer = Buffer.from(match[2], "base64");
  const extension = mime.includes("svg") ? "svg" : mime.includes("jpeg") ? "jpg" : "png";
  const key = `${storeId}/${folder}/${crypto.randomUUID()}.${extension}`;
  const stored = await getStorage().put(key, buffer, mime);
  return stored.url;
}

export async function createCustomization(store, payload, appUrl) {
  const publicId = payload.publicId || createCustomizationPublicId();
  const previewUrl =
    payload.previewUrl && !String(payload.previewUrl).startsWith("data:")
      ? payload.previewUrl
      : await storeDataUrl(store.id, "previews", payload.previewDataUrl || payload.previewUrl);
  const printFileUrl =
    payload.printFileUrl && !String(payload.printFileUrl).startsWith("data:")
      ? payload.printFileUrl
      : await storeDataUrl(store.id, "print-files", payload.printFileDataUrl || payload.printFileUrl);

  const row = await prisma.customization.create({
    data: {
      publicId,
      storeId: store.id,
      shopifyProductId: toGid(payload.shopifyProductId),
      shopifyVariantId: payload.shopifyVariantId
        ? toGid(payload.shopifyVariantId, "ProductVariant")
        : null,
      customerId: payload.customerId || null,
      configuration: payload.configuration || {},
      previewUrl,
      printFileUrl,
      quantity: Math.max(1, Number(payload.quantity) || 1),
    },
  });

  return serializeCustomization(row, appUrl);
}

export async function updateCustomization(storeId, publicId, payload, appUrl) {
  const existing = await prisma.customization.findFirst({
    where: { storeId, publicId },
  });
  if (!existing) return null;

  const previewUrl = payload.previewDataUrl
    ? await storeDataUrl(storeId, "previews", payload.previewDataUrl)
    : payload.previewUrl ?? existing.previewUrl;
  const printFileUrl = payload.printFileDataUrl
    ? await storeDataUrl(storeId, "print-files", payload.printFileDataUrl)
    : payload.printFileUrl ?? existing.printFileUrl;

  const row = await prisma.customization.update({
    where: { id: existing.id },
    data: {
      shopifyVariantId: payload.shopifyVariantId
        ? toGid(payload.shopifyVariantId, "ProductVariant")
        : existing.shopifyVariantId,
      customerId: payload.customerId ?? existing.customerId,
      configuration: payload.configuration ?? existing.configuration,
      previewUrl,
      printFileUrl,
      quantity: payload.quantity ?? existing.quantity,
    },
  });

  return serializeCustomization(row, appUrl);
}

export async function getCustomizationByPublicId(storeId, publicId, appUrl) {
  const row = await prisma.customization.findFirst({
    where: { storeId, publicId },
  });
  return serializeCustomization(row, appUrl);
}

export async function listRecentCustomizations(storeId, appUrl, take = 50) {
  const rows = await prisma.customization.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    take,
  });
  return rows.map((row) => serializeCustomization(row, appUrl));
}

export async function deleteCustomization(storeId, customizationId) {
  const existing = await prisma.customization.findFirst({
    where: { id: customizationId, storeId },
  });
  if (!existing) return false;
  const storage = getStorage();
  for (const url of [existing.previewUrl, existing.printFileUrl]) {
    const key = toUploadSplat(url);
    if (!key) continue;
    try {
      await storage.delete(key);
    } catch {
      // Preview files may already be gone.
    }
  }
  await prisma.customization.delete({ where: { id: existing.id } });
  return true;
}

function toUploadSplat(previewUrl) {
  const value = String(previewUrl || "");
  const at = value.indexOf("/uploads/");
  if (at !== -1) return value.slice(at + 1);
  if (value.startsWith("uploads/")) return value;
  if (value.startsWith("/uploads/")) return value.slice(1);
  return "";
}

export async function serveCustomizationPreview(request, splat) {
  const publicId = decodeURIComponent(String(splat || "").replace(/^p\//, "")).replace(
    /\.(png|jpe?g|webp|gif)$/i,
    "",
  );
  if (!/^CUS-[A-HJ-NP-Z2-9]+$/i.test(publicId)) {
    return new Response("Not found", { status: 404 });
  }
  const shop = parseShopDomain(new URL(request.url).searchParams.get("shop") || "");
  const row = shop
    ? await prisma.customization.findFirst({
        where: { publicId, store: { shop } },
        select: { previewUrl: true },
      })
    : await prisma.customization.findFirst({
        where: { publicId },
        select: { previewUrl: true },
      });
  const uploadPath = toUploadSplat(row?.previewUrl);
  if (!uploadPath) return new Response("Not found", { status: 404 });
  return servePublicUpload(uploadPath);
}

export async function savePreview(store, payload, appUrl) {
  const existing = payload.publicId
    ? await prisma.customization.findFirst({
        where: { storeId: store.id, publicId: payload.publicId },
      })
    : null;

  if (existing) {
    return updateCustomization(store.id, existing.publicId, payload, appUrl);
  }
  return createCustomization(store, payload, appUrl);
}
