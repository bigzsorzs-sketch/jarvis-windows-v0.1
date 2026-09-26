import { memo } from 'react';

const COLORS = ['#ffffff','#000000','#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899','#06b6d4'];

export default memo(function EditorOptionsBar({
  color, setColor,
  bgColor, setBgColor,
  brushSize, setBrushSize,
  opacity, setOpacity,
  fontSize, setFontSize,
  fontBold, setFontBold,
  filled, setFilled,
  activeTool,
}) {
  const showBrush = ['pencil', 'brush', 'eraser', 'line'].includes(activeTool);
  const showShape = ['rect', 'circle'].includes(activeTool);
  const showText = activeTool === 'text';

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 bg-card border-b border-border overflow-x-auto shrink-0 text-xs">
      {/* Foreground color */}
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground whitespace-nowrap">Szín:</span>
        <input type="color" value={color} onChange={e => setColor(e.target.value)}
          className="w-7 h-7 rounded cursor-pointer border border-border bg-transparent" />
      </div>

      {/* Bg color for shapes */}
      {showShape && (
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground whitespace-nowrap">Kitöltés:</span>
          <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)}
            className="w-7 h-7 rounded cursor-pointer border border-border bg-transparent" />
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={filled} onChange={e => setFilled(e.target.checked)} />
            <span className="text-muted-foreground">Kitöltött</span>
          </label>
        </div>
      )}

      {/* Quick palette */}
      <div className="flex items-center gap-1">
        {COLORS.map(c => (
          <button key={c} onClick={() => setColor(c)}
            style={{ background: c }}
            className={`w-5 h-5 rounded-full border-2 transition-all ${color === c ? 'border-primary scale-110' : 'border-border'}`}
          />
        ))}
      </div>

      {/* Brush size */}
      {showBrush && (
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground whitespace-nowrap">Méret:</span>
          <input type="range" min={1} max={60} value={brushSize} onChange={e => setBrushSize(+e.target.value)}
            className="w-20 accent-primary" />
          <span className="text-muted-foreground w-6">{brushSize}</span>
        </div>
      )}

      {/* Opacity */}
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground whitespace-nowrap">Átlátszóság:</span>
        <input type="range" min={1} max={100} value={opacity} onChange={e => setOpacity(+e.target.value)}
          className="w-20 accent-primary" />
        <span className="text-muted-foreground w-7">{opacity}%</span>
      </div>

      {/* Text options */}
      {showText && (
        <>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Betűméret:</span>
            <input type="number" min={8} max={120} value={fontSize} onChange={e => setFontSize(+e.target.value)}
              className="w-14 bg-secondary border border-border rounded px-1 py-0.5 text-foreground text-xs" />
          </div>
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={fontBold} onChange={e => setFontBold(e.target.checked)} />
            <span className="text-muted-foreground font-bold">Félkövér</span>
          </label>
        </>
      )}
    </div>
  );
});