import { memo } from 'react';
import { Eye, EyeOff, Trash2, Plus } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

export const BLEND_MODES = [
  { value: 'source-over', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'soft-light', label: 'Soft Light' },
  { value: 'hard-light', label: 'Hard Light' },
  { value: 'color-dodge', label: 'Color Dodge' },
  { value: 'color-burn', label: 'Color Burn' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
  { value: 'difference', label: 'Difference' },
  { value: 'exclusion', label: 'Exclusion' },
  { value: 'hue', label: 'Hue' },
  { value: 'saturation', label: 'Saturation' },
  { value: 'color', label: 'Color' },
  { value: 'luminosity', label: 'Luminosity' },
];

export default memo(function EditorLayerPanel({
  layers, activeLayer, setActiveLayer,
  onAdd, onDelete, onToggle, onMoveUp, onMoveDown,
  onBlendChange, onOpacityChange,
}) {
  const handleDragEnd = (result) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.index === destination.index) return;

    // Calculate actual layer indices (reversed display)
    const fromIndex = layers.length - 1 - source.index;
    const toIndex = layers.length - 1 - destination.index;

    // Move layer by comparing indices
    if (toIndex > fromIndex) {
      for (let i = fromIndex; i < toIndex; i++) onMoveUp(i);
    } else {
      for (let i = fromIndex; i > toIndex; i--) onMoveDown(i);
    }
  };

  return (
    <div className="w-44 bg-card border-l border-border flex flex-col shrink-0">
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-border">
        <span className="text-xs font-semibold text-foreground">Rétegek</span>
        <button onClick={onAdd} className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-primary">
          <Plus size={14} />
        </button>
      </div>
      
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="layers-list">
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className={`flex-1 overflow-y-auto transition-colors ${snapshot.isDraggingOver ? 'bg-primary/5' : ''}`}
            >
              {layers.length === 0 && (
                <div className="px-3 py-4 text-center">
                  <p className="text-[10px] text-muted-foreground">Réteg hozzáadásához kattints a + gombra</p>
                </div>
              )}
              {layers.length > 0 && (
                <p className="px-2 py-1.5 text-[9px] text-muted-foreground border-b border-border/40">
                  💡 Húzd a rétegeket sorrendhez
                </p>
              )}
            
              {[...layers].reverse().map((layer, ri) => {
                const i = layers.length - 1 - ri;
                const isActive = activeLayer === i;
                
                return (
                  <Draggable key={layer.id} draggableId={layer.id} index={ri}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        onClick={() => setActiveLayer(i)}
                        className={`flex flex-col px-2 py-1.5 text-xs border-b border-border/40 gap-1 transition-all ${
                          snapshot.isDragging ? 'bg-primary/20 shadow-lg' : isActive ? 'bg-primary/10 text-primary cursor-pointer' : 'text-foreground hover:bg-secondary cursor-pointer'
                        }`}
                      >
                        {/* Row 1: visibility + name + controls */}
                        <div className="flex items-center gap-1">
                          <button onClick={e => { e.stopPropagation(); onToggle(i); }}
                            className="shrink-0 text-muted-foreground hover:text-foreground">
                            {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                          </button>
                          <span className="flex-1 truncate text-[11px]">{layer.name}</span>
                          <button onClick={e => { e.stopPropagation(); onDelete(i); }}
                            className="text-muted-foreground hover:text-destructive"><Trash2 size={10} /></button>
                        </div>

                        {/* Row 2: blend mode */}
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <select
                            value={layer.blendMode || 'source-over'}
                            onChange={e => onBlendChange(i, e.target.value)}
                            className="flex-1 bg-secondary border border-border rounded px-1 py-0.5 text-[10px] text-foreground outline-none cursor-pointer"
                          >
                            {BLEND_MODES.map(m => (
                              <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                          </select>
                        </div>

                        {/* Row 3: opacity slider */}
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <span className="text-[9px] text-muted-foreground w-5 shrink-0">Opc</span>
                          <input
                            type="range" min={0} max={100}
                            value={layer.layerOpacity ?? 100}
                            onChange={e => onOpacityChange(i, +e.target.value)}
                            className="flex-1 accent-primary h-1"
                          />
                          <span className="text-[9px] text-muted-foreground w-5 text-right">
                            {layer.layerOpacity ?? 100}
                          </span>
                        </div>
                      </div>
                    )}
                  </Draggable>
                );
              })}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
});