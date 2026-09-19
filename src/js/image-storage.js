// ArrayBuffers avoid WebKit's IndexedDB Blob-write failures. Read old Blobs too.
export async function encodeImage(blob) {
  return blob ? { bytes: await blob.arrayBuffer(), type: blob.type } : null;
}
export function decodeImage(value) {
  if (!value || value instanceof Blob) return value || null;
  return new Blob([value.bytes], { type: value.type || "image/jpeg" });
}
