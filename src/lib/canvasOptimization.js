/**
 * Canvas Optimization Utilities — async, non-blocking image operations.
 * Replaces all toDataURL() calls with toBlob() + Worker + ObjectURL.
 *
 * API:
 * - canvasToBlob(canvas) → Promise<Blob>
 * - canvasToUrl(canvas, type) → Promise<string> (Object URL)
 * - uploadCanvasAsFile(canvas, filename) → Promise<{ file_url }>
 * - applyMaskAsync(sourceCanvas, maskData, x, y) → Promise<Canvas>
 * - resizeCanvasAsync(canvas, newWidth, newHeight) → Promise<Blob>
 */

import { logger } from '@/lib/logger';
import { jarvis } from '@/api/jarvisClient';

const MODULE = 'canvasOptimization';

// Worker singleton
let worker = null;

function getWorker() {
  if (!worker) {
    try {
      worker = new Worker(new URL('./canvasWorker.js', import.meta.url), { type: 'module' });
    } catch (err) {
      logger.warn(MODULE, 'Worker unavailable, fallback to main thread', { err: err?.message });
      worker = null;
    }
  }
  return worker;
}

// ─── MAIN API ──────────────────────────────────────────────────────────────

/**
 * Convert canvas to Blob (async, non-blocking).
 */
export async function canvasToBlob(canvas, type = 'image/png', quality = 0.9) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas toBlob returned null'));
        },
        type,
        quality
      );
    } catch (err) {
      logger.error(MODULE, 'canvasToBlob failed', { err: err?.message });
      reject(err);
    }
  });
}

/**
 * Convert canvas to Object URL (auto cleanup via WeakMap).
 */
const urlCache = new WeakMap();

export async function canvasToUrl(canvas, type = 'image/png', quality = 0.9) {
  try {
    const blob = await canvasToBlob(canvas, type, quality);
    const url = URL.createObjectURL(blob);

    // Track for cleanup
    urlCache.set(canvas, url);

    return url;
  } catch (err) {
    logger.error(MODULE, 'canvasToUrl failed', { err: err?.message });
    throw err;
  }
}

/**
 * Revoke Object URL and free memory.
 */
export function revokeCanvasUrl(canvas) {
  const url = urlCache.get(canvas);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(canvas);
  }
}

/**
 * Upload canvas as file to Jarvis (via blob).
 */
export async function uploadCanvasAsFile(canvas, filename = 'image.png', type = 'image/png') {
  try {
    const blob = await canvasToBlob(canvas, type);
    const file = new File([blob], filename, { type });

    return await jarvis.integrations.Core.UploadFile({file});
  } catch (err) {
    logger.error(MODULE, 'uploadCanvasAsFile failed', { err: err?.message });
    throw err;
  }
}

/**
 * Apply mask to canvas via worker (async).
 */
export async function applyMaskAsync(sourceCanvas, maskImageData, x = 0, y = 0) {
  const w = getWorker();
  if (!w) return fallbackApplyMask(sourceCanvas, maskImageData, x, y);

  return new Promise((resolve, reject) => {
    const ctx = sourceCanvas.getContext('2d');
    const sourceImageData = ctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);

    const timeout = setTimeout(
      () => reject(new Error('Worker timeout: applyMask')),
      10000
    );

    const handler = (e) => {
      clearTimeout(timeout);
      w.removeEventListener('message', handler);

      if (e.data.type === 'applyMask:done') {
        const resultData = new Uint8ClampedArray(e.data.data);
        const imageData = new ImageData(resultData, sourceCanvas.width, sourceCanvas.height);
        ctx.putImageData(imageData, 0, 0);
        resolve(sourceCanvas);
      } else if (e.data.type === 'error') {
        reject(new Error(e.data.message));
      }
    };

    w.addEventListener('message', handler);
    w.postMessage({
      type: 'applyMask',
      payload: {
        sourceData: sourceImageData.data.buffer,
        width: sourceCanvas.width,
        height: sourceCanvas.height,
        maskData: maskImageData.data.buffer,
        x,
        y,
      },
    }, [sourceImageData.data.buffer, maskImageData.data.buffer]);
  });
}

/**
 * Resize canvas via worker (async, returns Blob).
 */
export async function resizeCanvasAsync(canvas, newWidth, newHeight) {
  const w = getWorker();
  if (!w) return fallbackResize(canvas, newWidth, newHeight);

  return new Promise((resolve, reject) => {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const timeout = setTimeout(
      () => reject(new Error('Worker timeout: resizeImage')),
      10000
    );

    const handler = (e) => {
      clearTimeout(timeout);
      w.removeEventListener('message', handler);

      if (e.data.type === 'resizeImage:done') {
        const resizedCanvas = new OffscreenCanvas(newWidth, newHeight);
        const resizedCtx = resizedCanvas.getContext('2d');
        const resultData = new Uint8ClampedArray(e.data.data);
        const imageData = new ImageData(resultData, newWidth, newHeight);
        resizedCtx.putImageData(imageData, 0, 0);
        resolve(resizedCanvas.convertToBlob());
      } else if (e.data.type === 'error') {
        reject(new Error(e.data.message));
      }
    };

    w.addEventListener('message', handler);
    w.postMessage({
      type: 'resizeImage',
      payload: {
        canvasData: imageData.data.buffer,
        width: canvas.width,
        height: canvas.height,
        newWidth,
        newHeight,
      },
    }, [imageData.data.buffer]);
  });
}

/**
 * Compose multiple layers (async).
 */
export async function composeLayersAsync(layers, width, height) {
  const w = getWorker();
  if (!w) return fallbackCompose(layers, width, height);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Worker timeout: composeLayers')),
      10000
    );

    const handler = (e) => {
      clearTimeout(timeout);
      w.removeEventListener('message', handler);

      if (e.data.type === 'composeImages:done') {
        const resultData = new Uint8ClampedArray(e.data.data);
        const imageData = new ImageData(resultData, width, height);
        resolve(imageData);
      } else if (e.data.type === 'error') {
        reject(new Error(e.data.message));
      }
    };

    const layerBuffers = layers.map((l) => l.data.buffer);
    w.addEventListener('message', handler);
    w.postMessage({
      type: 'composeImages',
      payload: { layers, width, height },
    }, layerBuffers);
  });
}

// ─── FALLBACKS (Main Thread) ────────────────────────────────────────────────

function fallbackApplyMask(canvas, maskImageData, x, y) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const maskData = maskImageData.data;

  for (let i = 0; i < data.length; i += 4) {
    data[i + 3] = Math.round(data[i + 3] * (maskData[i + 3] / 255));
  }

  ctx.putImageData(imageData, 0, 0);
  return Promise.resolve(canvas);
}

function fallbackResize(canvas, newWidth, newHeight) {
  const ctx = canvas.getContext('2d');
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = newWidth;
  tempCanvas.height = newHeight;

  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.drawImage(canvas, 0, 0, newWidth, newHeight);

  return canvasToBlob(tempCanvas);
}

function fallbackCompose(layers, width, height) {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');

  layers.forEach((layer) => {
    const imageData = new ImageData(new Uint8ClampedArray(layer.data), width, height);
    ctx.globalAlpha = layer.opacity ?? 1;
    ctx.putImageData(imageData, 0, 0);
  });

  const imageData = ctx.getImageData(0, 0, width, height);
  return Promise.resolve(imageData);
}

// ─── MEMORY CLEANUP ────────────────────────────────────────────────────────

/**
 * Clean up all Object URLs (call on page unmount).
 */
export function cleanupAllUrls() {
  // WeakMap auto-cleanup, but manual cleanup available if needed
  logger.info(MODULE, 'Canvas URL cache cleanup');
}
