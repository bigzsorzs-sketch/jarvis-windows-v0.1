import { useState, useCallback } from 'react';
import { jarvis } from '@/api/jarvisClient';
import { CONFIG } from '@/lib/appConfig';
import { logger } from '@/lib/logger';

const MODULE = 'useProjectManager';
const LS_KEY = 'image_editor_projects';

// ── Local Storage helpers ──────────────────────────────────────────────────
function lsGetProjects() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}
function lsSaveProjects(projects) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(projects)); }
  catch (err) { logger.warn(MODULE, 'lsSaveProjects failed', { err: err?.message }); }
}

// ── Canvas serialization — async/non-blocking via toBlob ──────────────────
/**
 * Serialize all canvas layers to JSON asynchronously.
 * Uses toBlob() which runs off the main paint thread, then reads via FileReader.
 * This avoids the synchronous toDataURL() which blocks the UI thread on large canvases.
 */
export async function serializeLayers(layers) {
  const serialized = await Promise.all(
    layers.map(l => new Promise((resolve) => {
      l.canvas.toBlob(blob => {
        const reader = new FileReader();
        reader.onload = () => resolve({
          id:      l.id,
          name:    l.name,
          visible: l.visible !== false,
          blendMode:    l.blendMode    ?? 'source-over',
          layerOpacity: l.layerOpacity ?? 100,
          data:    reader.result, // base64 data URL
          w:       l.canvas.width,
          h:       l.canvas.height,
        });
        reader.readAsDataURL(blob);
      }, 'image/png');
    }))
  );
  return JSON.stringify(serialized);
}

export function deserializeLayers(json) {
  return new Promise((resolve) => {
    let raw;
    try { raw = JSON.parse(json); } catch { resolve([]); return; }
    if (!Array.isArray(raw) || raw.length === 0) { resolve([]); return; }

    let loaded = 0;
    const result = raw.map(item => {
      const canvas = document.createElement('canvas');
      canvas.width  = item.w ?? 1200;
      canvas.height = item.h ?? 800;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        loaded++;
        if (loaded === raw.length) resolve(result);
      };
      img.onerror = () => {
        // Graceful degradation: blank layer rather than crash
        logger.warn(MODULE, 'Failed to load layer image', { id: item.id });
        loaded++;
        if (loaded === raw.length) resolve(result);
      };
      img.src = item.data;
      return {
        id:           item.id,
        name:         item.name,
        visible:      item.visible !== false,
        blendMode:    item.blendMode    ?? 'source-over',
        layerOpacity: item.layerOpacity ?? 100,
        canvas,
      };
    });
    if (raw.length === 0) resolve([]);
  });
}

/**
 * Async thumbnail — uses toBlob to avoid blocking the main thread.
 */
async function makeThumbnail(layers, w, h) {
  const merged = document.createElement('canvas');
  merged.width  = Math.min(w, CONFIG.THUMBNAIL_W);
  merged.height = Math.min(h, CONFIG.THUMBNAIL_H);
  const ctx   = merged.getContext('2d');
  const scale = merged.width / w;
  for (const l of layers) {
    if (l.visible) ctx.drawImage(l.canvas, 0, 0, l.canvas.width * scale, l.canvas.height * scale);
  }
  return new Promise(resolve => {
    merged.toBlob(blob => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    }, 'image/jpeg', CONFIG.THUMBNAIL_QUALITY);
  });
}

// ── Hook ──────────────────────────────────────────────────────────────────
export default function useProjectManager() {
  const [projects, setProjects] = useState(lsGetProjects);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [saving, setSaving] = useState(false);

  // Save to local storage — async because serializeLayers/makeThumbnail are now non-blocking
  const saveLocal = useCallback(async (name, layers, filterState, w, h, existingId = null) => {
    const [thumbnail, layers_data] = await Promise.all([
      makeThumbnail(layers, w, h),
      serializeLayers(layers),
    ]);
    const id = existingId || `local_${Date.now()}`;
    const project = { id, name, thumbnail, layers_data, filter_state: filterState, canvas_width: w, canvas_height: h, updated_at: new Date().toISOString() };
    const all = lsGetProjects();
    const idx = all.findIndex(p => p.id === id);
    if (idx >= 0) all[idx] = project; else all.unshift(project);
    lsSaveProjects(all);
    setProjects([...all]);
    setCurrentProjectId(id);
    logger.info(MODULE, 'Project saved locally', { id, name });
    return id;
  }, []);

  // Save to server
  const saveServer = useCallback(async (name, layers, filterState, w, h, existingServerId = null) => {
    setSaving(true);
    try {
      const [thumbnail, layers_data] = await Promise.all([
        makeThumbnail(layers, w, h),
        serializeLayers(layers),
      ]);
      const payload = { name, thumbnail, layers_data, filter_state: filterState, canvas_width: w, canvas_height: h };
      const record = existingServerId
        ? await jarvis.entities.ImageProject.update(existingServerId, payload)
        : await jarvis.entities.ImageProject.create(payload);
      await saveLocal(name, layers, filterState, w, h, `server_${record.id}`);
      logger.info(MODULE, 'Project saved to server', { id: record.id, name });
      return record.id;
    } catch (err) {
      logger.error(MODULE, 'saveServer failed', { err: err?.message });
      throw err;
    } finally {
      setSaving(false);
    }
  }, [saveLocal]);

  // Load all server projects
  const loadServerProjects = useCallback(async () => {
    const user = await jarvis.auth.me();
    const list = user?.email ? await jarvis.entities.ImageProject.filter({ created_by: user.email }, '-updated_date', 50) : [];
    return list;
  }, []);

  // Add a named snapshot — async to avoid blocking main thread
  const addSnapshot = useCallback(async (projectId, snapName, layers, filterState, w, h) => {
    const all = lsGetProjects();
    const idx = all.findIndex(p => p.id === projectId);
    if (idx < 0) return;
    const [layers_data, thumbnail] = await Promise.all([
      serializeLayers(layers),
      makeThumbnail(layers, w, h),
    ]);
    const snap = {
      id: `snap_${Date.now()}`,
      name: snapName,
      timestamp: new Date().toISOString(),
      layers_data,
      thumbnail,
    };
    all[idx].snapshots = [snap, ...(all[idx].snapshots || [])].slice(0, 20);
    lsSaveProjects(all);
    setProjects([...all]);
  }, []);

  const deleteSnapshot = useCallback((projectId, snapId) => {
    const all = lsGetProjects();
    const idx = all.findIndex(p => p.id === projectId);
    if (idx < 0) return;
    all[idx].snapshots = (all[idx].snapshots || []).filter(s => s.id !== snapId);
    lsSaveProjects(all);
    setProjects([...all]);
  }, []);

  const deleteProject = useCallback((projectId) => {
    const all = lsGetProjects().filter(p => p.id !== projectId);
    lsSaveProjects(all);
    setProjects(all);
    if (currentProjectId === projectId) setCurrentProjectId(null);
  }, [currentProjectId]);

  const getProjectById = useCallback((id) => {
    return lsGetProjects().find(p => p.id === id) || null;
  }, []);

  return {
    projects, currentProjectId, setCurrentProjectId, saving,
    saveLocal, saveServer, loadServerProjects,
    addSnapshot, deleteSnapshot, deleteProject, getProjectById,
  };
}