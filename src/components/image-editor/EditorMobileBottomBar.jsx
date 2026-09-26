/**
 * EditorMobileBottomBar
 * Replaces the desktop sidebars on mobile with a horizontally scrollable
 * bottom toolbar + Drawer-based panels for Layers, AI, Projects, Filters.
 */
import { memo, useState } from 'react';
import {
  Layers, Wand2, FolderOpen, Sliders, Palette,
  Pencil, Eraser, Square, Circle, Minus, Type, Pipette,
  Move, MousePointer2, PaintBucket, Crop,
  ZoomIn, ZoomOut, Undo2, Redo2, Download, Upload, Trash2,
} from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import EditorLayerPanel from './EditorLayerPanel';
import AIImagePanel from './AIImagePanel';
import EditorFiltersPanel from './EditorFiltersPanel';
import AIMaskPanel from './AIMaskPanel';
import StyleTransferPanel from './StyleTransferPanel';
import ProjectManagerPanel from './ProjectManagerPanel';

const TOOLS = [
  { id: 'pencil',      icon: Pencil,        label: 'Ceruza' },
  { id: 'brush',       icon: PaintBucket,   label: 'Ecset' },
  { id: 'eraser',      icon: Eraser,        label: 'Radír' },
  { id: 'eyedropper',  icon: Pipette,       label: 'Szín' },
  { id: 'line',        icon: Minus,         label: 'Vonal' },
  { id: 'rect',        icon: Square,        label: 'Tégla' },
  { id: 'circle',      icon: Circle,        label: 'Kör' },
  { id: 'text',        icon: Type,          label: 'Szöveg' },
  { id: 'move',        icon: Move,          label: 'Mozgat' },
  { id: 'select',      icon: MousePointer2, label: 'Kijel.' },
  { id: 'crop',        icon: Crop,          label: 'Vágás' },
  { id: 'ai_mask',     icon: Wand2,         label: 'AI Maszk' },
];

const PANELS = [
  { id: 'layers',   icon: Layers,   label: 'Rétegek' },
  { id: 'ai',       icon: Wand2,    label: 'AI Kép' },
  { id: 'projects', icon: FolderOpen, label: 'Projektek' },
  { id: 'filters',  icon: Sliders,  label: 'Szűrők' },
  { id: 'style',    icon: Palette,  label: 'Stílus' },
];

const ActionBtn = ({ onClick, title, disabled, icon: Icon, danger }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-xl transition-all shrink-0 disabled:opacity-30
      ${danger ? 'text-destructive hover:bg-destructive/10' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
  >
    <Icon size={18} />
    <span className="text-[9px]">{title}</span>
  </button>
);

export default memo(function EditorMobileBottomBar({
  activeTool, setActiveTool,
  zoom, onZoomIn, onZoomOut,
  onUndo, onRedo, canUndo, canRedo,
  onImport, onExport, onClear,
  // panel props
  layers, activeLayer, setActiveLayer,
  onAddLayer, onDeleteLayer, onToggleLayer, onMoveUp, onMoveDown,
  onBlendChange, onOpacityChange,
  onImageReady, onPromptUsed,
  maskRect, onMaskChange, onMaskResult,
  filterState, CANVAS_W, CANVAS_H,
  onApplyFilter,
  currentProjectId, projects, saving,
  onSaveLocal, onSaveServer, onLoadProject, onAddSnapshot, onDeleteSnapshot, onDeleteProject,
  onStyleResult,
}) {
  const [openPanel, setOpenPanel] = useState(null);

  const togglePanel = (id) => setOpenPanel(p => p === id ? null : id);

  return (
    <>
      {/* ── Fixed bottom bar ── */}
      <div className="shrink-0 bg-card border-t border-border flex flex-col">
        {/* Row 1: Drawing tools */}
        <div className="flex items-center gap-1 px-2 py-1 overflow-x-auto scrollbar-none">
          {TOOLS.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setActiveTool(id)}
              title={label}
              className={`flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-xl shrink-0 transition-all min-w-[44px] min-h-[44px] justify-center ${
                activeTool === id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-secondary'
              }`}
            >
              <Icon size={16} />
              <span className="text-[8px] leading-tight">{label}</span>
            </button>
          ))}
        </div>

        {/* Row 2: Panels + Actions */}
        <div className="flex items-center justify-between px-2 pb-1 gap-1 border-t border-border/50">
          {/* Panel toggles */}
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
            {PANELS.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => togglePanel(id)}
                className={`flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-xl shrink-0 min-w-[44px] min-h-[44px] justify-center transition-all ${
                  openPanel === id
                    ? 'bg-accent/20 text-accent'
                    : 'text-muted-foreground hover:bg-secondary'
                }`}
              >
                <Icon size={15} />
                <span className="text-[8px]">{label}</span>
              </button>
            ))}
          </div>

          {/* Zoom + history + file actions */}
          <div className="flex items-center gap-0.5 shrink-0">
            <ActionBtn onClick={onZoomOut} title="-" icon={ZoomOut} />
            <span className="text-[10px] text-muted-foreground w-8 text-center font-mono">{zoom}%</span>
            <ActionBtn onClick={onZoomIn} title="+" icon={ZoomIn} />
            <ActionBtn onClick={onUndo} disabled={!canUndo} title="↩" icon={Undo2} />
            <ActionBtn onClick={onRedo} disabled={!canRedo} title="↪" icon={Redo2} />
            <ActionBtn onClick={onImport} title="📂" icon={Upload} />
            <ActionBtn onClick={onExport} title="💾" icon={Download} />
            <ActionBtn onClick={onClear} title="🗑" icon={Trash2} danger />
          </div>
        </div>
      </div>

      {/* ── Drawers ── */}

      {/* Layers */}
      <Drawer open={openPanel === 'layers'} onOpenChange={o => !o && setOpenPanel(null)}>
        <DrawerContent className="max-h-[70vh]">
          <DrawerHeader><DrawerTitle>Rétegek</DrawerTitle></DrawerHeader>
          <div className="overflow-y-auto pb-6">
            <EditorLayerPanel
              layers={layers} activeLayer={activeLayer} setActiveLayer={setActiveLayer}
              onAdd={onAddLayer} onDelete={onDeleteLayer} onToggle={onToggleLayer}
              onMoveUp={onMoveUp} onMoveDown={onMoveDown}
              onBlendChange={onBlendChange} onOpacityChange={onOpacityChange}
            />
          </div>
        </DrawerContent>
      </Drawer>

      {/* AI Image */}
      <Drawer open={openPanel === 'ai'} onOpenChange={o => !o && setOpenPanel(null)}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader><DrawerTitle>AI Képgenerálás</DrawerTitle></DrawerHeader>
          <div className="overflow-y-auto px-4 pb-6">
            <AIImagePanel onImageReady={onImageReady} onPromptUsed={onPromptUsed} />
          </div>
        </DrawerContent>
      </Drawer>

      {/* Projects */}
      <Drawer open={openPanel === 'projects'} onOpenChange={o => !o && setOpenPanel(null)}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader><DrawerTitle>Projektek</DrawerTitle></DrawerHeader>
          <div className="overflow-y-auto px-2 pb-6">
            <ProjectManagerPanel
              layers={layers} filterState={filterState}
              CANVAS_W={CANVAS_W} CANVAS_H={CANVAS_H}
              currentProjectId={currentProjectId} projects={projects} saving={saving}
              onSaveLocal={onSaveLocal} onSaveServer={onSaveServer}
              onLoadProject={onLoadProject} onAddSnapshot={onAddSnapshot}
              onDeleteSnapshot={onDeleteSnapshot} onDeleteProject={onDeleteProject}
            />
          </div>
        </DrawerContent>
      </Drawer>

      {/* Filters + AI Mask */}
      <Drawer open={openPanel === 'filters'} onOpenChange={o => !o && setOpenPanel(null)}>
        <DrawerContent className="max-h-[80vh]">
          <DrawerHeader><DrawerTitle>Szűrők & AI Maszk</DrawerTitle></DrawerHeader>
          <div className="overflow-y-auto px-4 pb-6 space-y-4">
            <AIMaskPanel
              maskRect={maskRect} onClearMask={() => onMaskChange(null)}
              layers={layers} CANVAS_W={CANVAS_W} CANVAS_H={CANVAS_H}
              onMaskResult={onMaskResult}
            />
            <EditorFiltersPanel onApplyFilter={onApplyFilter} />
          </div>
        </DrawerContent>
      </Drawer>

      {/* Style Transfer */}
      <Drawer open={openPanel === 'style'} onOpenChange={o => !o && setOpenPanel(null)}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader><DrawerTitle>Stílusátvitel</DrawerTitle></DrawerHeader>
          <div className="overflow-y-auto px-2 pb-6">
            <StyleTransferPanel
              layers={layers} CANVAS_W={CANVAS_W} CANVAS_H={CANVAS_H}
              maskRect={maskRect} onStyleResult={onStyleResult}
            />
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
});