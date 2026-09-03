export function logError(context, error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[product-customizer:${context}]`, message);
}

export const USER_ERRORS = {
  configLoad: "Unable to load product configuration.",
  configSave: "Unable to save product configuration.",
  uploadFailed: "Image upload failed.",
  imageTooLarge: "Your image is too large.",
  invalidImage: "That file type is not supported.",
  saveCustomization: "Unable to save customization.",
  loadCustomization: "Unable to load customization.",
  notEnabled: "Product customizer is not enabled for this product.",
  previewFailed: "Unable to generate preview.",
  printFailed: "Unable to generate print file.",
  cartFailed: "Unable to add the customized product to the cart.",
  notFound: "The requested resource was not found.",
  unauthorized: "You are not authorized to perform this action.",
};
