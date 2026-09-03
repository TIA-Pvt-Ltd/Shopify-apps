import { isPublicUploadPath, servePublicUpload } from "../services/storage.server";

export async function loader({ params }) {
  const splat = `uploads/${params["*"] || ""}`;
  if (!isPublicUploadPath(splat)) {
    return new Response("Not found", { status: 404 });
  }
  return servePublicUpload(splat);
}
