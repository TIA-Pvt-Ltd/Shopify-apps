import { savePreview, updateCustomization } from "./customization.server";

export async function generatePreview(store, payload, appUrl) {
  const customization = await savePreview(
    store,
    {
      ...payload,
      previewDataUrl: payload.previewDataUrl || payload.imageDataUrl,
    },
    appUrl,
  );
  return {
    customizationId: customization.publicId,
    previewUrl: customization.previewUrl,
    customization,
  };
}

export async function generatePrintFile(store, payload, appUrl) {
  const publicId = payload.publicId || payload.customizationId;
  if (!publicId) {
    const created = await savePreview(
      store,
      {
        ...payload,
        printFileDataUrl: payload.printFileDataUrl || payload.imageDataUrl,
      },
      appUrl,
    );
    return {
      customizationId: created.publicId,
      printFileUrl: created.printFileUrl,
      customization: created,
    };
  }

  const updated = await updateCustomization(
    store.id,
    publicId,
    {
      printFileDataUrl: payload.printFileDataUrl || payload.imageDataUrl,
      configuration: payload.configuration,
    },
    appUrl,
  );

  return {
    customizationId: updated?.publicId,
    printFileUrl: updated?.printFileUrl,
    customization: updated,
  };
}
