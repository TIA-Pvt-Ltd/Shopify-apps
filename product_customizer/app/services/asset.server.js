import prisma from "../db.server";
import { getStorage, absoluteAssetUrl } from "./storage.server";
import {
  validateUpload,
  validateFontUpload,
} from "../utils/file-validation";
import { defaultStoreSettings } from "../utils/customizer-defaults";
import { parseJsonField } from "../utils/json";

function serializeAsset(asset, appUrl) {
  return {
    ...asset,
    url: absoluteAssetUrl(asset.url, appUrl),
    thumbnailUrl: asset.thumbnailUrl
      ? absoluteAssetUrl(asset.thumbnailUrl, appUrl)
      : null,
    metadata: parseJsonField(asset.metadata, {}),
  };
}

export async function listAssets(storeId, { type, types, category, appUrl } = {}) {
  const typeFilter = types?.length ? { type: { in: types } } : type ? { type } : {};
  const assets = await prisma.designAsset.findMany({
    where: {
      storeId,
      ...typeFilter,
      ...(category ? { category } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  return assets.map((asset) => serializeAsset(asset, appUrl));
}

export async function createAsset(store, file, { name, type, category, metadata, appUrl }) {
  const settings = parseJsonField(store.settings, defaultStoreSettings());
  const maxBytes = Math.max(1, Number(settings.maxUploadMb) || 8) * 1024 * 1024;
  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = file.name || "upload";
  const declaredType = file.type || "";

  const validation =
    type === "font"
      ? validateFontUpload({
          buffer,
          declaredType,
          filename,
          maxBytes,
        })
      : validateUpload({
          buffer,
          declaredType,
          filename,
          maxBytes,
          allowSvg: settings.allowSvg !== false,
        });

  if (!validation.ok) {
    return { error: validation.error };
  }

  const key = `${store.id}/${type || "graphic"}/${crypto.randomUUID()}.${validation.extension}`;
  const stored = await getStorage().put(key, buffer, validation.mime);
  const asset = await prisma.designAsset.create({
    data: {
      storeId: store.id,
      name: name || filename.replace(/\.[^.]+$/, ""),
      type: type || "graphic",
      url: stored.url,
      thumbnailUrl: stored.url,
      category: category || "Other",
      metadata: {
        mime: validation.mime,
        size: buffer.length,
        originalName: filename,
        ...(metadata || {}),
      },
    },
  });

  return { asset: serializeAsset(asset, appUrl) };
}

export async function deleteAsset(storeId, assetId) {
  const asset = await prisma.designAsset.findFirst({
    where: { id: assetId, storeId },
  });
  if (!asset) return false;
  await getStorage().delete(asset.url.replace(/^\//, ""));
  await prisma.designAsset.delete({ where: { id: asset.id } });
  return true;
}

export async function listTemplates(storeId) {
  return prisma.customizerTemplate.findMany({
    where: { storeId },
    orderBy: { updatedAt: "desc" },
  });
}

export async function createTemplate(storeId, { name, configuration }) {
  return prisma.customizerTemplate.create({
    data: {
      storeId,
      name: name || "Untitled template",
      configuration: configuration || {},
    },
  });
}

export async function deleteTemplate(storeId, templateId) {
  const existing = await prisma.customizerTemplate.findFirst({
    where: { id: templateId, storeId },
  });
  if (!existing) return false;
  await prisma.customizerTemplate.delete({ where: { id: existing.id } });
  return true;
}
