import prisma from "../db.server";
import {
  defaultCustomizerConfiguration,
  defaultPrintArea,
  mergeConfiguration,
} from "../utils/customizer-defaults";
import { toGid } from "../utils/gid";
import { asPrintArea } from "../utils/json";

function serializeView(view) {
  const printAreaRecord = view.printAreas?.[0];
  const printArea = printAreaRecord
    ? {
        id: printAreaRecord.id,
        x: printAreaRecord.x,
        y: printAreaRecord.y,
        width: printAreaRecord.width,
        height: printAreaRecord.height,
        rotation: printAreaRecord.rotation,
        locked: printAreaRecord.locked,
      }
    : asPrintArea(view.printArea, defaultPrintArea(view.width, view.height));

  return {
    id: view.id,
    name: view.name,
    type: view.type,
    imageUrl: view.imageUrl,
    sortOrder: view.sortOrder,
    width: view.width,
    height: view.height,
    printArea,
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
  };
}

function serializeCustomizer(customizer) {
  return {
    id: customizer.id,
    storeId: customizer.storeId,
    shopifyProductId: customizer.shopifyProductId,
    enabled: customizer.enabled,
    name: customizer.name,
    configuration: mergeConfiguration(customizer.configuration),
    createdAt: customizer.createdAt,
    updatedAt: customizer.updatedAt,
    views: (customizer.views || [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(serializeView),
  };
}

const viewInclude = { printAreas: true };

export async function listCustomizers(storeId) {
  const rows = await prisma.productCustomizer.findMany({
    where: { storeId },
    include: { views: { include: viewInclude } },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(serializeCustomizer);
}

export async function getCustomizerByProduct(storeId, shopifyProductId) {
  const customizer = await prisma.productCustomizer.findUnique({
    where: {
      storeId_shopifyProductId: {
        storeId,
        shopifyProductId: toGid(shopifyProductId),
      },
    },
    include: { views: { include: viewInclude } },
  });
  return customizer ? serializeCustomizer(customizer) : null;
}

export async function getCustomizerById(storeId, customizerId) {
  if (!customizerId) return null;
  const customizer = await prisma.productCustomizer.findFirst({
    where: { id: customizerId, storeId },
    include: { views: { include: viewInclude } },
  });
  return customizer ? serializeCustomizer(customizer) : null;
}

export async function getCustomizerMap(storeId) {
  const rows = await prisma.productCustomizer.findMany({
    where: { storeId },
    select: {
      shopifyProductId: true,
      enabled: true,
      id: true,
      name: true,
    },
  });
  return Object.fromEntries(
    rows.map((row) => [row.shopifyProductId, row]),
  );
}

export async function createDefaultView(customizerId, name = "Front", type = "front") {
  const printArea = defaultPrintArea();
  return prisma.productView.create({
    data: {
      customizerId,
      name,
      type,
      sortOrder: 0,
      width: 800,
      height: 800,
      printArea,
      printAreas: { create: printArea },
    },
    include: viewInclude,
  });
}

export async function upsertCustomizer(storeId, { shopifyProductId, name, enabled }) {
  const productGid = toGid(shopifyProductId);
  const existing = await prisma.productCustomizer.findUnique({
    where: {
      storeId_shopifyProductId: { storeId, shopifyProductId: productGid },
    },
  });

  if (existing) {
    const updated = await prisma.productCustomizer.update({
      where: { id: existing.id },
      data: {
        name: name || existing.name,
        enabled: enabled ?? existing.enabled,
      },
      include: { views: { include: viewInclude } },
    });
    return serializeCustomizer(updated);
  }

  const created = await prisma.productCustomizer.create({
    data: {
      storeId,
      shopifyProductId: productGid,
      name: name || "Customizable product",
      // New customizers are storefront-visible by default; merchants can disable later.
      enabled: enabled === undefined ? true : Boolean(enabled),
      configuration: defaultCustomizerConfiguration(),
    },
    include: { views: { include: viewInclude } },
  });

  if (!created.views.length) {
    await createDefaultView(created.id);
  }

  const withViews = await prisma.productCustomizer.findUnique({
    where: { id: created.id },
    include: { views: { include: viewInclude } },
  });
  return serializeCustomizer(withViews);
}

export async function setCustomizerEnabled(storeId, shopifyProductId, enabled) {
  const customizer = await upsertCustomizer(storeId, {
    shopifyProductId,
    enabled,
  });
  const updated = await prisma.productCustomizer.update({
    where: { id: customizer.id },
    data: { enabled: Boolean(enabled) },
    include: { views: { include: viewInclude } },
  });
  return serializeCustomizer(updated);
}

export async function saveCustomizerConfiguration(
  storeId,
  shopifyProductId,
  payload,
) {
  const current = await upsertCustomizer(storeId, {
    shopifyProductId,
    name: payload.name,
  });

  const configuration = mergeConfiguration(payload.configuration);
  await prisma.productCustomizer.update({
    where: { id: current.id },
    data: {
      name: payload.name || current.name,
      enabled: payload.enabled ?? current.enabled,
      configuration,
    },
  });

  if (Array.isArray(payload.views)) {
    await syncViews(current.id, payload.views);
  }

  const saved = await prisma.productCustomizer.findUnique({
    where: { id: current.id },
    include: { views: { include: viewInclude } },
  });
  return serializeCustomizer(saved);
}

async function syncViews(customizerId, views) {
  const existing = await prisma.productView.findMany({
    where: { customizerId },
    include: viewInclude,
  });
  const incomingIds = new Set(views.map((view) => view.id).filter(Boolean));

  const toDelete = existing.filter((view) => !incomingIds.has(view.id));
  if (toDelete.length) {
    await prisma.productView.deleteMany({
      where: { id: { in: toDelete.map((view) => view.id) } },
    });
  }

  for (const [index, view] of views.entries()) {
    const printArea = asPrintArea(
      view.printArea,
      defaultPrintArea(view.width, view.height),
    );
    const data = {
      name: view.name || `View ${index + 1}`,
      type: view.type || "custom",
      imageUrl: view.imageUrl || null,
      sortOrder: Number.isFinite(view.sortOrder) ? view.sortOrder : index,
      width: Number(view.width) || 800,
      height: Number(view.height) || 800,
      printArea,
    };

    if (view.id && existing.some((row) => row.id === view.id)) {
      await prisma.productView.update({
        where: { id: view.id },
        data,
      });
      const currentAreas = await prisma.printArea.findMany({
        where: { productViewId: view.id },
      });
      if (currentAreas[0]) {
        await prisma.printArea.update({
          where: { id: currentAreas[0].id },
          data: printArea,
        });
      } else {
        await prisma.printArea.create({
          data: { productViewId: view.id, ...printArea },
        });
      }
    } else {
      await prisma.productView.create({
        data: {
          customizerId,
          ...data,
          printAreas: { create: printArea },
        },
      });
    }
  }
}

export async function getDashboardStats(storeId) {
  const [
    configuredProducts,
    customizableProducts,
    savedDesigns,
    customizations,
    graphicsCount,
    fontsCount,
    recentCustomizations,
    recentCustomizers,
  ] = await Promise.all([
    prisma.productCustomizer.count({ where: { storeId } }),
    prisma.productCustomizer.count({ where: { storeId, enabled: true } }),
    prisma.customizerTemplate.count({ where: { storeId } }),
    prisma.customization.count({ where: { storeId } }),
    prisma.designAsset.count({ where: { storeId, type: { in: ["graphic", "upload"] } } }),
    prisma.designAsset.count({ where: { storeId, type: "font" } }),
    prisma.customization.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        publicId: true,
        shopifyProductId: true,
        quantity: true,
        previewUrl: true,
        createdAt: true,
        configuration: true,
      },
    }),
    prisma.productCustomizer.findMany({
      where: { storeId },
      orderBy: { updatedAt: "desc" },
      take: 8,
      include: {
        views: {
          orderBy: { sortOrder: "asc" },
          take: 1,
          select: { imageUrl: true },
        },
      },
    }),
  ]);

  return {
    configuredProducts,
    customizableProducts,
    savedDesigns,
    customizations,
    graphicsCount,
    fontsCount,
    recentCustomizations: recentCustomizations.map((row) => ({
      id: row.id,
      publicId: row.publicId,
      shopifyProductId: row.shopifyProductId,
      quantity: row.quantity,
      previewUrl: row.previewUrl,
      createdAt: row.createdAt,
      color: row.configuration?.selectedColor?.name || "",
    })),
    recentCustomizers: recentCustomizers.map((row) => ({
      id: row.id,
      shopifyProductId: row.shopifyProductId,
      enabled: row.enabled,
      name: row.name,
      updatedAt: row.updatedAt,
      imageUrl: row.views?.[0]?.imageUrl || "",
    })),
  };
}
