import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function clearPrismaRequireCache() {
  for (const key of Object.keys(require.cache || {})) {
    const normalized = key.replace(/\\/g, "/");
    if (
      normalized.includes("/@prisma/client") ||
      normalized.includes("/.prisma/client")
    ) {
      delete require.cache[key];
    }
  }
}

function createPrismaClient() {
  const { PrismaClient } = require("@prisma/client");
  return new PrismaClient();
}

function hasStoreModel(client) {
  return Boolean(client && typeof client.store?.upsert === "function");
}

function getPrisma() {
  const current = global.prismaGlobal;
  if (hasStoreModel(current)) {
    return current;
  }

  if (current?.$disconnect) {
    current.$disconnect().catch(() => {});
  }

  clearPrismaRequireCache();
  const client = createPrismaClient();
  global.prismaGlobal = client;
  return client;
}

const prisma = new Proxy(
  {},
  {
    get(_target, prop) {
      const client = getPrisma();
      const value = client[prop];
      return typeof value === "function" ? value.bind(client) : value;
    },
  },
);

export default prisma;
