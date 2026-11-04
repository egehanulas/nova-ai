import test from "node:test";
import assert from "node:assert/strict";
import { selectPrimaryScreenSource, serializeScreenThumbnail } from "./screen-capture.js";

test("selects the primary display source without guessing across multiple monitors", () => {
  const primary = { display_id: "2", thumbnail: {} };
  const secondary = { display_id: "1", thumbnail: {} };
  assert.equal(selectPrimaryScreenSource([secondary, primary], 2), primary);
  assert.equal(selectPrimaryScreenSource([secondary, primary], 3), null);
  assert.equal(selectPrimaryScreenSource([primary], 3), primary);
  assert.equal(selectPrimaryScreenSource([], 2), null);
});

test("serializes a non-empty Electron screen thumbnail as JPEG", () => {
  const source = {
    thumbnail: {
      isEmpty: () => false,
      getSize: () => ({ width: 1280, height: 720 }),
      toJPEG: (quality) => {
        assert.equal(quality, 62);
        return Buffer.from("nova-screen");
      }
    }
  };
  const result = serializeScreenThumbnail(source);
  assert.equal(result.screenshot, Buffer.from("nova-screen").toString("base64"));
  assert.equal(result.screenshotMimeType, "image/jpeg");
  assert.equal(result.screenshotWidth, 1280);
  assert.equal(result.screenshotHeight, 720);
});

test("rejects empty or invalid Electron thumbnails", () => {
  assert.throws(() => serializeScreenThumbnail({ thumbnail: { isEmpty: () => true } }), /boş veya kullanılamıyor/);
  assert.throws(() => serializeScreenThumbnail({ thumbnail: { isEmpty: () => false, getSize: () => ({ width: 0, height: 20 }) } }), /boyutları geçersiz/);
});
