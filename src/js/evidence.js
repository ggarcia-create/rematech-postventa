export async function compressImage(file) {
  if (!file.type.startsWith("image/"))
    throw new Error("Selecciona un archivo de imagen.");
  if (file.size > 30 * 1024 * 1024)
    throw new Error(
      "La imagen supera 30 MB. Reduce su tamaño e intenta de nuevo.",
    );
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const ratio = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * ratio));
    canvas.height = Math.max(1, Math.round(img.height * ratio));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error("No fue posible comprimir la imagen.")),
        "image/jpeg",
        0.85,
      ),
    );
  } catch {
    throw new Error("No se pudo leer la imagen. Prueba con JPEG, PNG o WebP.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
export const blobDataURL = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
