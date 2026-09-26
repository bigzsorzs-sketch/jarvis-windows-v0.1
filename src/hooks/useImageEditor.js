import { useRef, useState, useCallback, useEffect } from 'react';
import { canvasToBlob } from '@/lib/canvasOptimization.js';

const CANVAS_W = 1200;
const CANVAS_H = 800;
const MAX_HISTORY = 30;
const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024;
const MAX_EXTERNAL_URL_LENGTH = 2048;
const REMOTE_IMAGE_TIMEOUT_MS = 8000;
const ALLOWED_EXTERNAL_IMAGE_HOSTS = ['images.unsplash.com', 'media.jarvis.com', 'files.jarvis.com'];
const SAFE_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function createLayer(name, w = CANVAS_W, h = CANVAS_H) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { id: crypto.randomUUID(), name, canvas, visible: true, blendMode: 'source-over', layerOpacity: 100 };
}

function validateExternalUrl(value) {
  if (typeof value !== 'string' || !value || value.length > MAX_EXTERNAL_URL_LENGTH) {
    throw new Error('Invalid external URL');
  }

  const parsed = new URL(value);
  if (parsed.protocol !== 'https:') {
    throw new Error('Only HTTPS URLs are allowed');
  }
  if (!ALLOWED_EXTERNAL_IMAGE_HOSTS.includes(parsed.hostname)) {
    throw new Error('External host not allowed');
  }

  return parsed.toString();
}

function isSafeImageFile(file) {
  return !!file && SAFE_IMAGE_MIME_TYPES.has(file.type) && file.size > 0 && file.size <= MAX_IMPORT_FILE_SIZE;
}

function createTimeoutController(timeoutMs) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  return { controller, clear: () => window.clearTimeout(timeoutId) };
}

function applyImageToContext(ctx, img) {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  const scale = Math.min(CANVAS_W / img.width, CANVAS_H / img.height, 1);
  ctx.drawImage(img, 0, 0, img.width * scale, img.height * scale);
}

export default function useImageEditor() {
  const [layers, setLayers] = useState(() => [createLayer('Réteg 1')]);
  const [activeLayer, setActiveLayer] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [imageLoadError, setImageLoadError] = useState('');
  const drawing = useRef(false);
  const mountedRef = useRef(true);
  const lastPos = useRef(null);
  const cropStart = useRef(null);
  const textInputRef = useRef(null);
  const objectUrlsRef = useRef(new Set());

  const getCtx = useCallback(() => {
    const layer = layers[activeLayer];
    if (!layer) return null;
    return layer.canvas.getContext('2d');
  }, [layers, activeLayer]);

  const snapshot = useCallback(() => {
    const snap = layers.map((layer) => {
      const ctx = layer.canvas.getContext('2d');
      return {
        id: layer.id,
        name: layer.name,
        visible: layer.visible,
        blendMode: layer.blendMode,
        layerOpacity: layer.layerOpacity,
        width: layer.canvas.width,
        height: layer.canvas.height,
        imageData: ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height),
      };
    });

    const trimmed = history.slice(0, historyIndex + 1);
    const next = [...trimmed, snap].slice(-MAX_HISTORY);
    setHistory(next);
    setHistoryIndex(next.length - 1);
  }, [layers, history, historyIndex]);

  const restoreSnapshot = useCallback((snap) => {
    setLayers(snap.map((layer) => {
      const canvas = document.createElement('canvas');
      canvas.width = layer.width;
      canvas.height = layer.height;
      canvas.getContext('2d').putImageData(layer.imageData, 0, 0);
      return {
        id: layer.id,
        name: layer.name,
        canvas,
        visible: layer.visible,
        blendMode: layer.blendMode || 'source-over',
        layerOpacity: layer.layerOpacity ?? 100,
      };
    }));
  }, []);

  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    const idx = historyIndex - 1;
    restoreSnapshot(history[idx]);
    setHistoryIndex(idx);
  }, [history, historyIndex, restoreSnapshot]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const idx = historyIndex + 1;
    restoreSnapshot(history[idx]);
    setHistoryIndex(idx);
  }, [history, historyIndex, restoreSnapshot]);

  const addLayer = useCallback(() => {
    setLayers((prev) => {
      const nextIndex = prev.length;
      const newLayer = createLayer(`Réteg ${nextIndex + 1}`);
      setActiveLayer(nextIndex);
      return [...prev, newLayer];
    });
  }, []);

  const deleteLayer = useCallback((i) => {
    if (layers.length === 1) return;
    setLayers(prev => prev.filter((_, idx) => idx !== i));
    setActiveLayer(prev => Math.max(0, prev > i ? prev - 1 : prev));
  }, [layers]);

  const toggleLayer = useCallback((i) => {
    setLayers(prev => prev.map((l, idx) => idx === i ? { ...l, visible: !l.visible } : l));
  }, []);

  const setLayerBlendMode = useCallback((i, blendMode) => {
    setLayers(prev => prev.map((l, idx) => idx === i ? { ...l, blendMode } : l));
  }, []);

  const setLayerOpacity = useCallback((i, layerOpacity) => {
    setLayers(prev => prev.map((l, idx) => idx === i ? { ...l, layerOpacity } : l));
  }, []);

  const moveLayerUp = useCallback((i) => {
    if (i >= layers.length - 1) return;
    setLayers(prev => { const a = [...prev]; [a[i], a[i+1]] = [a[i+1], a[i]]; return a; });
  }, [layers]);

  const moveLayerDown = useCallback((i) => {
    if (i <= 0) return;
    setLayers(prev => { const a = [...prev]; [a[i], a[i-1]] = [a[i-1], a[i]]; return a; });
  }, []);

  const clearCanvas = useCallback(() => {
    snapshot();
    const ctx = getCtx();
    if (ctx) ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  }, [getCtx, snapshot]);

  const importImage = useCallback((file) => {
    if (!isSafeImageFile(file)) {
      setImageLoadError('Image file is too large or invalid.');
      return;
    }

    const img = new Image();
    const url = URL.createObjectURL(file);
    objectUrlsRef.current.add(url);
    img.decoding = 'async';

    img.onload = () => {
      try {
        snapshot();
        const ctx = getCtx();
        if (!ctx) throw new Error('Canvas context unavailable');
        applyImageToContext(ctx, img);
        setImageLoadError('');
      } catch {
        setImageLoadError('Failed to load the selected image.');
      } finally {
        URL.revokeObjectURL(url);
        objectUrlsRef.current.delete(url);
      }
    };

    img.onerror = () => {
      setImageLoadError('Failed to load the selected image.');
      URL.revokeObjectURL(url);
      objectUrlsRef.current.delete(url);
    };

    try {
      img.src = url;
    } catch {
      setImageLoadError('Failed to load the selected image.');
      URL.revokeObjectURL(url);
      objectUrlsRef.current.delete(url);
    }
  }, [getCtx, snapshot]);

  const importImageFromUrl = useCallback(async (url) => {
    const { controller, clear } = createTimeoutController(REMOTE_IMAGE_TIMEOUT_MS);

    try {
      const safeUrl = validateExternalUrl(url);
      const response = await fetch(safeUrl, {
        method: 'GET',
        mode: 'cors',
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Image request failed');

      const contentLength = Number(response.headers.get('content-length') || 0);
      if (contentLength && contentLength > MAX_IMPORT_FILE_SIZE) {
        throw new Error('Remote image too large');
      }

      const blob = await response.blob();
      if (!SAFE_IMAGE_MIME_TYPES.has(blob.type) || blob.size > MAX_IMPORT_FILE_SIZE) {
        throw new Error('Invalid remote image');
      }

      const objectUrl = URL.createObjectURL(blob);
      objectUrlsRef.current.add(objectUrl);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';

      img.onload = () => {
        try {
          if (!mountedRef.current) return;
          snapshot();
          const ctx = getCtx();
          if (!ctx) throw new Error('Canvas context unavailable');
          applyImageToContext(ctx, img);
          setImageLoadError('');
        } catch {
          if (mountedRef.current) setImageLoadError('Failed to load the external image.');
        } finally {
          URL.revokeObjectURL(objectUrl);
          objectUrlsRef.current.delete(objectUrl);
        }
      };

      img.onerror = () => {
        if (mountedRef.current) setImageLoadError('Failed to load the external image.');
        URL.revokeObjectURL(objectUrl);
        objectUrlsRef.current.delete(objectUrl);
      };

      img.src = objectUrl;
    } catch {
      if (mountedRef.current) setImageLoadError('Failed to load the external image.');
    } finally {
      clear();
    }
  }, [getCtx, snapshot]);

  // Stores the current filter state for the active layer
  const [filterState, setFilterState] = useState({});

  const applyFilter = useCallback((filterId, value) => {
    if (filterId === 'reset') {
      setFilterState({});
      return;
    }
    setFilterState(prev => ({ ...prev, [filterId]: value }));
  }, []);

  // Build a CSS filter string from filterState
  const buildFilterString = useCallback((state) => {
    const parts = [];
    if (state.grayscale) parts.push('grayscale(100%)');
    if (state.sepia) parts.push('sepia(100%)');
    if (state.invert) parts.push('invert(100%)');
    if (state.blur !== undefined && state.blur !== 0) parts.push(`blur(${state.blur}px)`);
    if (state.brightness !== undefined && state.brightness !== 100) parts.push(`brightness(${state.brightness}%)`);
    if (state.contrast !== undefined && state.contrast !== 100) parts.push(`contrast(${state.contrast}%)`);
    if (state.saturate !== undefined && state.saturate !== 100) parts.push(`saturate(${state.saturate}%)`);
    if (state['hue-rotate'] !== undefined && state['hue-rotate'] !== 0) parts.push(`hue-rotate(${state['hue-rotate']}deg)`);
    return parts.join(' ');
  }, []);

  const exportImage = useCallback(async (meta = {}) => {
    const ts = Date.now();
    const filename = `kep_${ts}`;

    // 1. Export PNG (async, non-blocking)
    const merged = document.createElement('canvas');
    merged.width = CANVAS_W; merged.height = CANVAS_H;
    const mCtx = merged.getContext('2d');
    layers.forEach(l => { if (l.visible) mCtx.drawImage(l.canvas, 0, 0); });

    try {
      const blob = await canvasToBlob(merged, 'image/png', 0.9);
      const url = URL.createObjectURL(blob);
      objectUrlsRef.current.add(url);
      const imgLink = document.createElement('a');
      imgLink.href = url;
      imgLink.download = `${filename}.png`;
      imgLink.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        objectUrlsRef.current.delete(url);
      }, 100);
    } catch (err) {
      console.error('Export PNG failed:', err);
    }

    // 2. Export JSON metadata
    const metadata = {
      exported_at: new Date().toISOString(),
      canvas: { width: CANVAS_W, height: CANVAS_H },
      layers: layers.map((l, i) => ({
        index: i,
        name: l.name,
        visible: l.visible,
        width: l.canvas.width,
        height: l.canvas.height,
      })),
      filters: meta.filterState || {},
      ai_prompt: meta.aiPrompt || null,
      ai_reference_images_count: meta.aiRefCount ?? null,
      project_name: meta.projectName || null,
    };
    const jsonBlob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' });
    const jsonUrl = URL.createObjectURL(jsonBlob);
    objectUrlsRef.current.add(jsonUrl);
    const jsonLink = document.createElement('a');
    jsonLink.href = jsonUrl;
    jsonLink.download = `${filename}_meta.json`;
    jsonLink.click();
    setTimeout(() => {
      URL.revokeObjectURL(jsonUrl);
      objectUrlsRef.current.delete(jsonUrl);
    }, 100);
  }, [layers]);

  const loadLayers = useCallback((newLayers) => {
    setLayers(newLayers);
    setActiveLayer(0);
    setHistory([]);
    setHistoryIndex(-1);
  }, []);

  const loadFilterState = useCallback((state) => {
    setFilterState(state || {});
  }, []);

  const zoomIn = () => setZoom(z => Math.min(z + 10, 300));
  const zoomOut = () => setZoom(z => Math.max(z - 10, 20));

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current.clear();
    };
  }, []);

  return {
    layers, activeLayer, setActiveLayer,
    zoom, zoomIn, zoomOut,
    undo, redo,
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1,
    addLayer, deleteLayer, toggleLayer, moveLayerUp, moveLayerDown,
    setLayerBlendMode, setLayerOpacity,
    clearCanvas, importImage, importImageFromUrl, exportImage,
    loadLayers, loadFilterState,
    getCtx, snapshot, drawing, lastPos, cropStart, textInputRef,
    filterState, applyFilter, buildFilterString,
    imageLoadError,
    CANVAS_W, CANVAS_H,
  };
}