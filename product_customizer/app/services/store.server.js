import prisma from "../db.server";
import { defaultStoreSettings } from "../utils/customizer-defaults";
import { parseShopDomain } from "../utils/gid";

export async function getOrCreateStore(shop) {
  const domain = parseShopDomain(shop);
  if (!domain) {
    throw new Error("A shop domain is required.");
  }

  return prisma.store.upsert({
    where: { shop: domain },
    create: {
      shop: domain,
      settings: defaultStoreSettings(),
    },
    update: {},
  });
}

export async function getStoreByShop(shop) {
  const domain = parseShopDomain(shop);
  if (!domain) return null;
  return prisma.store.findUnique({ where: { shop: domain } });
}

export async function updateStoreSettings(storeId, settings) {
  return prisma.store.update({
    where: { id: storeId },
    data: { settings },
  });
}

export async function deleteStoreByShop(shop) {
  const domain = parseShopDomain(shop);
  if (!domain) return;
  await prisma.store.deleteMany({ where: { shop: domain } });
}
