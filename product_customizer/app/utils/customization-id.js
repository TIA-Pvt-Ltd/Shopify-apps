export function createCustomizationPublicId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let token = "";
  for (const byte of bytes) {
    token += alphabet[byte % alphabet.length];
  }
  return `CUS-${token}`;
}
