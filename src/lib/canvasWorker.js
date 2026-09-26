/**
 * Canvas Worker — offscreen processing for heavy image operations.
 * Runs in a separate thread, no UI blocking.
 *
 * Handles:
 * - canvas.toBlob() async conversion
 * - pixel manipulation (resize, filter, mask apply)
 * - image composition
 */

// Message handler: { type, payload }
self.onmessage = async (e) => {
  const { type, payload } = e.data;

  try {
    switch (type) {
      case 'canvasToBlob': {
        const { canvasData, width, height, quality = 0.9 } = payload;
        const blob = await canvasToBlobWorker(canvasData, width, height, quality);
        self.postMessage({
          type: 'canvasToBlob:done',
          blob: await blob.arrayBuffer(),
          size: blob.size,
        });
        break;
      }

      case 'applyMask': {
        const { sourceData, width, height, maskData, x, y } = payload;
        const result = applyMaskWorker(sourceData, width, height, maskData, x, y);
        self.postMessage({
          type: 'applyMask:done',
          data: result,
        });
        break;
      }

      case 'resizeImage': {
        const { canvasData, width, height, newWidth, newHeight } = payload;
        const result = resizeImageWorker(canvasData, width, height, newWidth, newHeight);
        self.postMessage({
          type: 'resizeImage:done',
          data: result,
          width: newWidth,
          height: newHeight,
        });
        break;
      }

      case 'composeImages': {
        const { layers, width, height } = payload;
        const result = composeLayers(layers, width, height);
        self.postMessage({
          type: 'composeImages:done',
          data: result,
        });
        break;
      }

      default:
        self.postMessage({ type: 'error', message: 'Unknown message type' });
    }
  } catch (err) {
    self.postMessage({
      type: 'error',
      message: err?.message || 'Worker error',
    });
  }
};

// ─── HELPERS ────────────────────────────────────────────────────────────────

async function canvasToBlobWorker(canvasData, width, height, quality) {
  // Reconstruct canvas from ImageData in worker
  const offscreen = new OffscreenCanvas(width, height);
  const ctx = offscreen.getContext('2d');

  // Create ImageData from transferred buffer
  const imageData = new ImageData(
    new Uint8ClampedArray(canvasData),
    width,
    height
  );
  ctx.putImageData(imageData, 0, 0);

  // Async toBlob
  const blob = await offscreen.convertToBlob({ quality });
  return blob;
}

function applyMaskWorker(sourceData, width, height, maskData, x, y) {
  const source = new Uint8ClampedArray(sourceData);
  const mask = new Uint8ClampedArray(maskData);

  // Alpha blend: apply mask alpha to source
  for (let i = 0; i < source.length; i += 4) {
    const maskAlpha = mask[i + 3] / 255;
    source[i + 3] = Math.round(source[i + 3] * maskAlpha);
  }

  return source.buffer;
}

function resizeImageWorker(canvasData, width, height, newWidth, newHeight) {
  // Nearest-neighbor resize (fast, pixel-perfect)
  const source = new Uint8ClampedArray(canvasData);
  const dest = new Uint8ClampedArray(newWidth * newHeight * 4);

  const scaleX = width / newWidth;
  const scaleY = height / newHeight;

  for (let y = 0; y < newHeight; y++) {
    for (let x = 0; x < newWidth; x++) {
      const srcX = Math.floor(x * scaleX);
      const srcY = Math.floor(y * scaleY);
      const srcIdx = (srcY * width + srcX) * 4;
      const dstIdx = (y * newWidth + x) * 4;

      dest[dstIdx] = source[srcIdx];
      dest[dstIdx + 1] = source[srcIdx + 1];
      dest[dstIdx + 2] = source[srcIdx + 2];
      dest[dstIdx + 3] = source[srcIdx + 3];
    }
  }

  return dest.buffer;
}

function composeLayers(layers, width, height) {
  // Composite multiple layer ImageData
  const composite = new Uint8ClampedArray(width * height * 4);

  layers.forEach((layer) => {
    const layerData = new Uint8ClampedArray(layer.data);
    const alpha = layer.opacity ?? 1;

    for (let i = 0; i < layerData.length; i += 4) {
      const srcA = (layerData[i + 3] / 255) * alpha;
      const dstA = composite[i + 3] / 255;

      // Alpha composite
      const outA = srcA + dstA * (1 - srcA);
      if (outA > 0) {
        composite[i] = Math.round(
          (layerData[i] * srcA + composite[i] * dstA * (1 - srcA)) / outA
        );
        composite[i + 1] = Math.round(
          (layerData[i + 1] * srcA + composite[i + 1] * dstA * (1 - srcA)) / outA
        );
        composite[i + 2] = Math.round(
          (layerData[i + 2] * srcA + composite[i + 2] * dstA * (1 - srcA)) / outA
        );
        composite[i + 3] = Math.round(outA * 255);
      }
    }
  });

  return composite.buffer;
}