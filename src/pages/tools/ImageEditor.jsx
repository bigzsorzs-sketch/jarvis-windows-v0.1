import { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';
import EditorToolbar from '@/components/image-editor/EditorToolbar';
import EditorOptionsBar from '@/components/image-editor/EditorOptionsBar';
import EditorLayerPanel from '@/components/image-editor/EditorLayerPanel';
import EditorCanvas from '@/components/image-editor/EditorCanvas';
import AIImagePanel from '@/components/image-editor/AIImagePanel';
import EditorFiltersPanel from '@/components/image-editor/EditorFiltersPanel';
import ProjectManagerPanel from '@/components/image-editor/ProjectManagerPanel';
import AIMaskPanel from '@/components/image-editor/AIMaskPanel';
import StyleTransferPanel from '@/components/image-editor/StyleTransferPanel';
import OutpaintPanel from '@/components/image-editor/OutpaintPanel';
import AIEnhancePanel from '@/components/image-editor/AIEnhancePanel';
import EditorMobileBottomBar from '@/components/image-editor/EditorMobileBottomBar';
import useImageEditor from '@/hooks/useImageEditor';
import useProjectManager from '@/hooks/useProjectManager';
import { jarvis } from '@/api/jarvisClient';
import { useJarvisModuleContext } from '@/hooks/useJarvisModuleContext';

export default function ImageEditor() {
  const [activeTool, setActiveTool] = useState('pencil');
  const [color, setColor] = useState('#ffffff');
  const [bgColor, setBgColor] = useState('#3b82f6');
  const [brushSize, setBrushSize] = useState(8);
  const [opacity, setOpacity] = useState(100);
  const [fontSize, setFontSize] = useState(24);
  const [fontBold, setFontBold] = useState(false);
  const [filled, setFilled] = useState(false);
  const [maskRect, setMaskRect] = useState(null);
  const [showStylePanel, setShowStylePanel] = useState(false);
  const [showOutpaintPanel, setShowOutpaintPanel] = useState(false);
  const [showEnhancePanel, setShowEnhancePanel] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [imageEditorNotice, setImageEditorNotice] = useState('');
  const [cropRect, setCropRect] = useState(null);
  const [rotationDeg, setRotationDeg] = useState(0);
  const fileInputRef = useRef(null);

  const editor = useImageEditor();
  const pm = useProjectManager();
  const [lastAiPrompt, setLastAiPrompt] = useState(null);
  const [lastAiRefCount, setLastAiRefCount] = useState(0);

  // Load sample image on mount
  useEffect(() => {
    const loadSampleImage = async () => {
      try {
        const sampleImageUrl = 'https://images.unsplash.com/photo-1552820728-8ac41f1ce891?w=1200&q=80';
        await editor.importImageFromUrl(sampleImageUrl);
      } catch {
        // optional sample image skipped silently
      }
    };
    loadSampleImage();
  }, []);

  const generateAndLoadImage = useCallback(async (promptText) => {
    const prompt = String(promptText || '').trim();
    if (!prompt) return { success: false, message: 'Mondd meg, milyen képet szeretnél.' };

    setAiLoading(true);
    try {
      const generated = await jarvis.integrations.Core.GenerateImage({ prompt });
      if (!generated?.url) throw new Error('IMAGE_RESULT_MISSING');
      await editor.importImageFromUrl(generated.url);
      setLastAiPrompt(prompt);
      setLastAiRefCount(0);
      setAiResponse('✅ Kép generálva és hozzáadva!');
      setAiPrompt('');
      return { success: true, message: 'Elkészítettem és betöltöttem a képet.', data: generated };
    } catch (error) {
      const missingKey = String(error?.message || '').includes('OPENROUTER_API_KEY_REQUIRED');
      const message = missingKey
        ? 'A képgeneráláshoz előbb add meg az OpenRouter API kulcsot a Beállításokban.'
        : 'A képgenerálás most nem sikerült.';
      setAiResponse(message);
      return { success: false, message, error: error?.message || String(error) };
    } finally {
      setAiLoading(false);
    }
  }, [editor]);

  const handleGenerateImage = async () => {
    await generateAndLoadImage(aiPrompt);
  };

  const getImageEditorContext = useCallback(() => ({
    activeTool,
    layerCount: editor.layers.length,
    activeLayer: editor.activeLayer,
    canUndo: editor.canUndo,
    canRedo: editor.canRedo,
    zoom: editor.zoom,
    lastAiPrompt,
  }), [activeTool, editor.layers.length, editor.activeLayer, editor.canUndo, editor.canRedo, editor.zoom, lastAiPrompt]);

  const getImageEditorActions = useCallback(() => ({
    'image.generate': {
      description: 'AI kép generálása és betöltése a vászonra',
      risk: 'provider-action',
      handler: async ({ prompt }) => generateAndLoadImage(prompt),
    },
    'image.undo': {
      description: 'Utolsó képszerkesztési lépés visszavonása',
      risk: 'local-edit',
      handler: async () => {
        if (!editor.canUndo) return { success: false, message: 'Nincs visszavonható lépés.' };
        editor.undo();
        return { success: true, message: 'Visszavontam az utolsó lépést.' };
      },
    },
    'image.redo': {
      description: 'Visszavont képszerkesztési lépés ismétlése',
      risk: 'local-edit',
      handler: async () => {
        if (!editor.canRedo) return { success: false, message: 'Nincs ismételhető lépés.' };
        editor.redo();
        return { success: true, message: 'Visszaállítottam a lépést.' };
      },
    },
    'image.zoom_in': {
      description: 'Kép nagyítása',
      risk: 'view',
      handler: async () => {
        editor.zoomIn();
        return { success: true, message: 'Nagyítottam a képet.' };
      },
    },
    'image.zoom_out': {
      description: 'Kép kicsinyítése',
      risk: 'view',
      handler: async () => {
        editor.zoomOut();
        return { success: true, message: 'Kicsinyítettem a képet.' };
      },
    },
    'image.clear': {
      description: 'A teljes vászon törlése',
      risk: 'destructive',
      confirmationRequired: true,
      handler: async () => {
        editor.clearCanvas();
        return { success: true, message: 'Töröltem a vásznat.' };
      },
    },
  }), [editor, generateAndLoadImage]);

  useJarvisModuleContext({
    id: 'image-editor',
    label: 'Képszerkesztő',
    getContext: getImageEditorContext,
    getActions: getImageEditorActions,
  });

  const applyCrop = () => {
    if (!cropRect) return;
    editor.snapshot();
    const ctx = editor.getCtx();
    if (!ctx) return;
    const imageData = ctx.getImageData(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
    ctx.clearRect(0, 0, editor.CANVAS_W, editor.CANVAS_H);
    ctx.putImageData(imageData, 0, 0);
    setCropRect(null);
    setActiveTool('pencil');
  };

  const applyRotation = async () => {
    editor.snapshot();
    const ctx = editor.getCtx();
    if (!ctx) return;
    const img = new Image();
    const canvas = editor.layers[editor.activeLayer]?.canvas;
    if (!canvas) return;

    // Use async canvasToUrl instead of toDataURL
    const { canvasToUrl, revokeCanvasUrl } = await import('@/lib/canvasOptimization.js');
    const url = await canvasToUrl(canvas, 'image/png', 0.9);

    img.onload = () => {
      ctx.save();
      ctx.translate(editor.CANVAS_W / 2, editor.CANVAS_H / 2);
      ctx.rotate((rotationDeg * Math.PI) / 180);
      ctx.drawImage(img, -editor.CANVAS_W / 2, -editor.CANVAS_H / 2);
      ctx.restore();
      editor.snapshot();
      revokeCanvasUrl(canvas);
    };
    img.src = url;
    setRotationDeg(0);
  };

  const handleImport = () => fileInputRef.current?.click();
  const handleFileChange = (e) => {
    const files = e.target.files;
    if (files) {
      // Max 15 images at a time
      const filesToLoad = Array.from(files).slice(0, 15);
      filesToLoad.forEach(file => editor.importImage(file));
    }
    e.target.value = '';
  };

  useEffect(() => {
    const handleColorPicked = (e) => {
      if (e.detail) setColor(e.detail);
    };
    window.addEventListener('colorpicked', handleColorPicked);
    return () => window.removeEventListener('colorpicked', handleColorPicked);
  }, []);

  const handleLoadProject = useCallback((restoredLayers, filterState, projectId) => {
    editor.loadLayers(restoredLayers);
    if (filterState) editor.loadFilterState(filterState);
    if (projectId) pm.setCurrentProjectId(projectId);
  }, [editor, pm]);

  const handleSaveLocal = useCallback((name, existingId) => {
    pm.saveLocal(name, editor.layers, editor.filterState, editor.CANVAS_W, editor.CANVAS_H, existingId);
  }, [editor, pm]);

  const handleSaveServer = useCallback(async (name, existingId) => {
    const serverId = existingId?.startsWith('server_') ? existingId.replace('server_', '') : null;
    await pm.saveServer(name, editor.layers, editor.filterState, editor.CANVAS_W, editor.CANVAS_H, serverId);
  }, [editor, pm]);

  const handleAddSnapshot = useCallback((projectId, snapName) => {
    pm.addSnapshot(projectId, snapName, editor.layers, editor.filterState, editor.CANVAS_W, editor.CANVAS_H);
  }, [editor, pm]);

  const handleStyleResult = useCallback(({ url, x, y, w, h, prompt }) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      editor.snapshot();
      const ctx = editor.getCtx();
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, img.width, img.height, x, y, w, h);
      setLastAiPrompt(prompt);
    };
    img.src = url;
  }, [editor]);

  const handleOutpaintComplete = useCallback(({ url, newW, newH, offsetX, offsetY }) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // Create new canvas with expanded size
      const newCanvas = document.createElement('canvas');
      newCanvas.width = newW;
      newCanvas.height = newH;
      const newCtx = newCanvas.getContext('2d');
      
      // Draw the expanded image
      newCtx.drawImage(img, 0, 0);
      
      // Resize active layer to new dimensions
      const activeLayer = editor.layers[editor.activeLayer];
      if (activeLayer) {
        activeLayer.canvas.width = newW;
        activeLayer.canvas.height = newH;
        const layerCtx = activeLayer.canvas.getContext('2d');
        layerCtx.drawImage(newCanvas, 0, 0);
      }
      
      editor.snapshot();
      setShowOutpaintPanel(false);
    };
    img.src = url;
  }, [editor]);

  const handleEnhanceComplete = useCallback((enhancedUrl) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      editor.snapshot();
      const ctx = editor.getCtx();
      if (!ctx) return;
      const activeLayer = editor.layers[editor.activeLayer];
      if (!activeLayer) return;
      
      // Clear and draw enhanced image on active layer
      ctx.clearRect(0, 0, editor.CANVAS_W, editor.CANVAS_H);
      const scale = Math.min(editor.CANVAS_W / img.width, editor.CANVAS_H / img.height, 1);
      ctx.drawImage(img, 0, 0, img.width * scale, img.height * scale);
    };
    img.src = enhancedUrl;
  }, [editor]);

  const handleMaskResult = useCallback(({ url, x, y, w, h, prompt }) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      editor.snapshot();
      const ctx = editor.getCtx();
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, img.width, img.height, x, y, w, h);
      setMaskRect(null);
      setLastAiPrompt(prompt);
    };
    img.src = url;
  }, [editor]);

  const exportArgs = {
    filterState: editor.filterState,
    aiPrompt: lastAiPrompt,
    aiRefCount: lastAiRefCount,
    projectName: pm.projects.find(p => p.id === pm.currentProjectId)?.name || null,
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <EditorOptionsBar
        color={color} setColor={setColor}
        bgColor={bgColor} setBgColor={setBgColor}
        brushSize={brushSize} setBrushSize={setBrushSize}
        opacity={opacity} setOpacity={setOpacity}
        fontSize={fontSize} setFontSize={setFontSize}
        fontBold={fontBold} setFontBold={setFontBold}
        filled={filled} setFilled={setFilled}
        activeTool={activeTool}
      />

      {/* ── Desktop layout (md+) ── */}
      <div className="hidden md:flex flex-1 overflow-hidden">
        <EditorToolbar
          activeTool={activeTool} setActiveTool={setActiveTool}
          zoom={editor.zoom} onZoomIn={editor.zoomIn} onZoomOut={editor.zoomOut}
          onUndo={editor.undo} onRedo={editor.redo}
          canUndo={editor.canUndo} canRedo={editor.canRedo}
          showStylePanel={showStylePanel}
          onToggleStylePanel={() => setShowStylePanel(p => !p)}
          showOutpaintPanel={showOutpaintPanel}
          onToggleOutpaintPanel={() => setShowOutpaintPanel(p => !p)}
          showEnhancePanel={showEnhancePanel}
          onToggleEnhancePanel={() => setShowEnhancePanel(p => !p)}
          onImport={handleImport}
          onExport={() => editor.exportImage(exportArgs)}
          onClear={editor.clearCanvas}
        />

        <ProjectManagerPanel
          layers={editor.layers} filterState={editor.filterState}
          CANVAS_W={editor.CANVAS_W} CANVAS_H={editor.CANVAS_H}
          currentProjectId={pm.currentProjectId} projects={pm.projects} saving={pm.saving}
          onSaveLocal={handleSaveLocal} onSaveServer={handleSaveServer}
          onLoadProject={handleLoadProject} onAddSnapshot={handleAddSnapshot}
          onDeleteSnapshot={pm.deleteSnapshot} onDeleteProject={pm.deleteProject}
        />

        <div className="flex flex-col shrink-0 border-l border-border">
          <AIMaskPanel
            maskRect={maskRect} onClearMask={() => setMaskRect(null)}
            layers={editor.layers} CANVAS_W={editor.CANVAS_W} CANVAS_H={editor.CANVAS_H}
            onMaskResult={handleMaskResult}
          />
          <EditorFiltersPanel onApplyFilter={editor.applyFilter} />
        </div>

        {showStylePanel && (
          <StyleTransferPanel
            layers={editor.layers} CANVAS_W={editor.CANVAS_W} CANVAS_H={editor.CANVAS_H}
            maskRect={maskRect} onStyleResult={handleStyleResult}
          />
        )}

        {showOutpaintPanel && (
          <OutpaintPanel
            layers={editor.layers} CANVAS_W={editor.CANVAS_W} CANVAS_H={editor.CANVAS_H}
            onOutpaintComplete={handleOutpaintComplete}
          />
        )}

        {showEnhancePanel && (
          <AIEnhancePanel
            layers={editor.layers} activeLayer={editor.activeLayer}
            CANVAS_W={editor.CANVAS_W} CANVAS_H={editor.CANVAS_H}
            onEnhanceComplete={handleEnhanceComplete}
          />
        )}

        <EditorCanvas
          layers={editor.layers} activeLayer={editor.activeLayer} zoom={editor.zoom}
          activeTool={activeTool} color={color} bgColor={bgColor}
          brushSize={brushSize} opacity={opacity} fontSize={fontSize}
          fontBold={fontBold} filled={filled}
          drawing={editor.drawing} lastPos={editor.lastPos}
          snapshot={editor.snapshot} getCtx={editor.getCtx}
          filterString={editor.buildFilterString(editor.filterState)}
          CANVAS_W={editor.CANVAS_W} CANVAS_H={editor.CANVAS_H}
          maskRect={maskRect} onMaskChange={setMaskRect}
          cropRect={cropRect} onCropChange={setCropRect}
        />

        <EditorLayerPanel
          layers={editor.layers} activeLayer={editor.activeLayer}
          setActiveLayer={editor.setActiveLayer}
          onAdd={editor.addLayer} onDelete={editor.deleteLayer} onToggle={editor.toggleLayer}
          onMoveUp={editor.moveLayerUp} onMoveDown={editor.moveLayerDown}
          onBlendChange={editor.setLayerBlendMode} onOpacityChange={editor.setLayerOpacity}
        />

        <AIImagePanel
          onImageReady={editor.importImageFromUrl}
          onPromptUsed={(prompt, refCount) => { setLastAiPrompt(prompt); setLastAiRefCount(refCount); }}
          aiPrompt={aiPrompt}
          onPromptChange={setAiPrompt}
          onResponseReady={setAiResponse}
        />
      </div>

      {/* ── Mobile layout (< md) ── */}
      <div className="flex md:hidden flex-1 overflow-hidden flex-col">
        {/* Canvas takes all available space */}
        <div className="flex-1 overflow-hidden">
          <EditorCanvas
            layers={editor.layers} activeLayer={editor.activeLayer} zoom={editor.zoom}
            activeTool={activeTool} color={color} bgColor={bgColor}
            brushSize={brushSize} opacity={opacity} fontSize={fontSize}
            fontBold={fontBold} filled={filled}
            drawing={editor.drawing} lastPos={editor.lastPos}
            snapshot={editor.snapshot} getCtx={editor.getCtx}
            filterString={editor.buildFilterString(editor.filterState)}
            CANVAS_W={editor.CANVAS_W} CANVAS_H={editor.CANVAS_H}
            maskRect={maskRect} onMaskChange={setMaskRect}
          />
        </div>

        {/* Mobile bottom panel */}
        <EditorMobileBottomBar
          activeTool={activeTool} setActiveTool={setActiveTool}
          zoom={editor.zoom} onZoomIn={editor.zoomIn} onZoomOut={editor.zoomOut}
          onUndo={editor.undo} onRedo={editor.redo}
          canUndo={editor.canUndo} canRedo={editor.canRedo}
          onImport={handleImport}
          onExport={() => editor.exportImage(exportArgs)}
          onClear={editor.clearCanvas}
          layers={editor.layers} activeLayer={editor.activeLayer}
          setActiveLayer={editor.setActiveLayer}
          onAddLayer={editor.addLayer} onDeleteLayer={editor.deleteLayer}
          onToggleLayer={editor.toggleLayer} onMoveUp={editor.moveLayerUp}
          onMoveDown={editor.moveLayerDown} onBlendChange={editor.setLayerBlendMode}
          onOpacityChange={editor.setLayerOpacity}
          onImageReady={editor.importImageFromUrl}
          onPromptUsed={(prompt, refCount) => { setLastAiPrompt(prompt); setLastAiRefCount(refCount); }}
          maskRect={maskRect} onMaskChange={setMaskRect} onMaskResult={handleMaskResult}
          filterState={editor.filterState}
          CANVAS_W={editor.CANVAS_W} CANVAS_H={editor.CANVAS_H}
          onApplyFilter={editor.applyFilter}
          currentProjectId={pm.currentProjectId} projects={pm.projects} saving={pm.saving}
          onSaveLocal={handleSaveLocal} onSaveServer={handleSaveServer}
          onLoadProject={handleLoadProject} onAddSnapshot={handleAddSnapshot}
          onDeleteSnapshot={pm.deleteSnapshot} onDeleteProject={pm.deleteProject}
          onStyleResult={handleStyleResult}
        />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Transform Options */}
      {activeTool === 'crop' && cropRect && (
        <div className="shrink-0 bg-card border-t border-border p-3 flex gap-2">
          <button onClick={applyCrop} className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">✂️ Vágás alkalmaz</button>
          <button onClick={() => setCropRect(null)} className="flex-1 py-2 rounded-xl bg-secondary text-foreground text-sm font-semibold">Mégse</button>
        </div>
      )}

      {activeTool === 'rotate' && (
        <div className="shrink-0 bg-card border-t border-border p-3 space-y-2">
          <input type="range" min="-360" max="360" value={rotationDeg} onChange={e => setRotationDeg(Number(e.target.value))} className="w-full" />
          <div className="flex gap-2">
            <button onClick={applyRotation} disabled={rotationDeg === 0} className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40">🔄 Alkalmaz</button>
            <button onClick={() => setRotationDeg(0)} className="flex-1 py-2 rounded-xl bg-secondary text-foreground text-sm font-semibold">Vissza</button>
          </div>
        </div>
      )}

      {activeTool === 'resize' && (
        <div className="shrink-0 bg-card border-t border-border p-3">
          <p className="text-xs text-muted-foreground mb-2">Húzd meg az aktív réteget az átméretezéshez</p>
        </div>
      )}

      {/* AI Prompt Input & Response - Desktop & Mobile */}
      <div className="shrink-0 bg-card border-t border-border p-3 space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleGenerateImage()}
            placeholder="Írd meg mit szeretnél generálni vagy módosítani..."
            className="flex-1 bg-secondary rounded-xl px-4 py-2.5 text-sm outline-none border border-border text-foreground placeholder:text-muted-foreground"
          />
          <button
            onClick={handleGenerateImage}
            disabled={aiLoading || !aiPrompt.trim()}
            className="shrink-0 w-10 h-10 bg-primary rounded-xl flex items-center justify-center disabled:opacity-40 transition-opacity"
            title="Kép generálása"
          >
            {aiLoading ? <Loader2 size={16} className="text-primary-foreground animate-spin" /> : <Send size={16} className="text-primary-foreground" />}
          </button>
        </div>
        
        {(aiResponse || imageEditorNotice) && (
          <div className="bg-secondary rounded-xl p-3 border border-border/50 max-h-24 overflow-y-auto">
            <p className="text-xs font-semibold text-primary mb-1">AI</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{aiResponse || imageEditorNotice}</p>
          </div>
        )}
      </div>
    </div>
  );
}