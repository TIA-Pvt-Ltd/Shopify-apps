import prisma from "./app/db.server.js";

const rows = await prisma.productCustomizer.findMany({
  select: { shopifyProductId: true, enabled: true, name: true },
});
console.log(JSON.stringify(rows, null, 2));
await prisma.$disconnect();
