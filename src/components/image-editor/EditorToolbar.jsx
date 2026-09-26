import { memo } from 'react';
import {
  MousePointer2, Pencil, Eraser, Square, Circle, Minus, Type,
  Crop, ZoomIn, ZoomOut, Undo2, Redo2, Download, Upload, Trash2,
  Pipette, PaintBucket, Move, Wand2, Palette, RotateCw, Maximize2, Expand, Sparkles
} from 'lucide-react';

const tools = [
  { id: 'select', icon: MousePointer2, label: 'Kijelölés' },
  { id: 'move', icon: Move, label: 'Mozgatás' },
  { id: 'pencil', icon: Pencil, label: 'Ceruza' },
  { id: 'brush', icon: PaintBucket, label: 'Ecset' },
  { id: 'eraser', icon: Eraser, label: 'Radír' },
  { id: 'eyedropper', icon: Pipette, label: 'Színszedő' },
  { id: 'line', icon: Minus, label: 'Vonal' },
  { id: 'rect', icon: Square, label: 'Téglalap' },
  { id: 'circle', icon: Circle, label: 'Kör' },
  { id: 'text', icon: Type, label: 'Szöveg' },
  { id: 'crop', icon: Crop, label: 'Körülvágás' },
  { id: 'rotate', icon: RotateCw, label: 'Elforgatás' },
  { id: 'resize', icon: Maximize2, label: 'Átméretezés' },
  { id: 'ai_mask', icon: Wand2, label: 'AI Maszk' },
  { id: 'outpaint', icon: Expand, label: 'Gen. Fill' },
];

export default memo(function EditorToolbar({
  activeTool, setActiveTool,
  zoom, onZoomIn, onZoomOut,
  onUndo, onRedo, canUndo, canRedo,
  onImport, onExport, onClear,
  showStylePanel, onToggleStylePanel,
  showOutpaintPanel, onToggleOutpaintPanel,
  showEnhancePanel, onToggleEnhancePanel,
}) {
  return (
    <div className="flex flex-col gap-1 w-12 bg-card border-r border-border py-2 px-1 items-center overflow-y-auto shrink-0">
      {tools.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          onClick={() => setActiveTool(id)}
          title={label}
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
            activeTool === id
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
          }`}
        >
          <Icon size={16} />
        </button>
      ))}

      <div className="w-full border-t border-border my-1" />

      <button onClick={onZoomIn} title="Nagyítás" className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground">
        <ZoomIn size={16} />
      </button>
      <span className="text-xs text-muted-foreground font-mono">{zoom}%</span>
      <button onClick={onZoomOut} title="Kicsinyítés" className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground">
        <ZoomOut size={16} />
      </button>

      <div className="w-full border-t border-border my-1" />

      <button onClick={onUndo} disabled={!canUndo} title="Visszavonás" className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30">
        <Undo2 size={16} />
      </button>
      <button onClick={onRedo} disabled={!canRedo} title="Újra" className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30">
        <Redo2 size={16} />
      </button>

      <div className="w-full border-t border-border my-1" />

      <button onClick={onImport} title="Megnyitás" className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground">
        <Upload size={16} />
      </button>
      <button onClick={onExport} title="Mentés PNG" className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground">
        <Download size={16} />
      </button>
      <button onClick={onClear} title="Törlés" className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-destructive/20 hover:text-destructive">
        <Trash2 size={16} />
      </button>

      <div className="w-full border-t border-border my-1" />

      <button
        onClick={onToggleStylePanel}
        title="Stílusátvitel"
        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
          showStylePanel ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
        }`}
      >
        <Palette size={16} />
      </button>

      <button
        onClick={onToggleOutpaintPanel}
        title="Generative Fill"
        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
          showOutpaintPanel ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
        }`}
      >
        <Expand size={16} />
      </button>

      <button
        onClick={onToggleEnhancePanel}
        title="AI Képjavítás"
        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
          showEnhancePanel ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
        }`}
      >
        <Sparkles size={16} />
      </button>
    </div>
  );
});