export function selectPrimaryScreenSource(sources, displayId) {
  if (!Array.isArray(sources)) return null;
  const expectedId = String(displayId);
  const matchingSource = sources.find((source) =>
    source && String(source.display_id) === expectedId
  );
  if (matchingSource) return matchingSource;
  return sources.length === 1 ? sources[0] : null;
}

export function serializeScreenThumbnail(source) {
  const thumbnail = source?.thumbnail;
  if (!thumbnail || typeof thumbnail.isEmpty !== "function" || thumbnail.isEmpty()) {
    throw new Error("Electron ekran görüntüsü boş veya kullanılamıyor.");
  }
  const size = thumbnail.getSize();
  if (!size || !Number.isInteger(size.width) || !Number.isInteger(size.height) ||
      size.width < 1 || size.height < 1) {
    throw new Error("Electron ekran görüntüsü boyutları geçersiz.");
  }
  const jpeg = thumbnail.toJPEG(50);
  if (!jpeg || jpeg.length === 0) {
    throw new Error("Electron ekran görüntüsü JPEG biçimine dönüştürülemedi.");
  }
  return {
    screenshot: jpeg.toString("base64"),
    screenshotMimeType: "image/jpeg",
    screenshotWidth: size.width,
    screenshotHeight: size.height
  };
}
