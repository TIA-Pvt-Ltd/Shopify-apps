-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "settings" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProductCustomizer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "configuration" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductCustomizer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductView" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customizerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "imageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER NOT NULL DEFAULT 800,
    "height" INTEGER NOT NULL DEFAULT 800,
    "printArea" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductView_customizerId_fkey" FOREIGN KEY ("customizerId") REFERENCES "ProductCustomizer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PrintArea" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productViewId" TEXT NOT NULL,
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "width" REAL NOT NULL,
    "height" REAL NOT NULL,
    "rotation" REAL NOT NULL DEFAULT 0,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "PrintArea_productViewId_fkey" FOREIGN KEY ("productViewId") REFERENCES "ProductView" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DesignAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "category" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DesignAsset_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomizerTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "configuration" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CustomizerTemplate_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Customization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "publicId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "shopifyVariantId" TEXT,
    "customerId" TEXT,
    "configuration" TEXT NOT NULL,
    "previewUrl" TEXT,
    "printFileUrl" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Customization_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Store_shop_key" ON "Store"("shop");

-- CreateIndex
CREATE INDEX "ProductCustomizer_storeId_idx" ON "ProductCustomizer"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCustomizer_storeId_shopifyProductId_key" ON "ProductCustomizer"("storeId", "shopifyProductId");

-- CreateIndex
CREATE INDEX "ProductView_customizerId_idx" ON "ProductView"("customizerId");

-- CreateIndex
CREATE INDEX "PrintArea_productViewId_idx" ON "PrintArea"("productViewId");

-- CreateIndex
CREATE INDEX "DesignAsset_storeId_type_idx" ON "DesignAsset"("storeId", "type");

-- CreateIndex
CREATE INDEX "DesignAsset_storeId_category_idx" ON "DesignAsset"("storeId", "category");

-- CreateIndex
CREATE INDEX "CustomizerTemplate_storeId_idx" ON "CustomizerTemplate"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Customization_publicId_key" ON "Customization"("publicId");

-- CreateIndex
CREATE INDEX "Customization_storeId_idx" ON "Customization"("storeId");

-- CreateIndex
CREATE INDEX "Customization_storeId_shopifyProductId_idx" ON "Customization"("storeId", "shopifyProductId");

-- CreateIndex
CREATE INDEX "Customization_publicId_idx" ON "Customization"("publicId");
