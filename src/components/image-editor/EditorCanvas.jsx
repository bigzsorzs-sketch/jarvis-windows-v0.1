import { useRef, useEffect, useCallback, useState } from 'react';

export default function EditorCanvas({
  layers, activeLayer, zoom,
  activeTool, color, bgColor, brushSize, opacity, fontSize, fontBold, filled,
  drawing, lastPos, snapshot, getCtx,
  filterString,
  CANVAS_W, CANVAS_H,
  maskRect, onMaskChange,
  cropRect, onCropChange,
}) {
  const displayRef = useRef(null);
  const overlayRef = useRef(null);
  const shapeStart = useRef(null);
  const [textInput, setTextInput] = useState(null); // {x,y}

  // Composite all layers onto display canvas
  const redraw = useCallback(() => {
    const disp = displayRef.current;
    if (!disp) return;
    const ctx = disp.getContext('2d');
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    // Checkerboard background
    for (let x = 0; x < CANVAS_W; x += 20) {
      for (let y = 0; y < CANVAS_H; y += 20) {
        ctx.fillStyle = (Math.floor(x/20) + Math.floor(y/20)) % 2 === 0 ? '#2a2a2a' : '#1a1a1a';
        ctx.fillRect(x, y, 20, 20);
      }
    }
    layers.forEach(l => {
      if (!l.visible) return;
      ctx.save();
      ctx.globalCompositeOperation = l.blendMode || 'source-over';
      ctx.globalAlpha = (l.layerOpacity ?? 100) / 100;
      ctx.drawImage(l.canvas, 0, 0);
      ctx.restore();
    });
  }, [layers, CANVAS_W, CANVAS_H]);

  useEffect(() => { redraw(); }, [layers, redraw]);

  // Draw persistent selection rect on overlay
  useEffect(() => {
    if (!overlayRef.current) return;
    const ovCtx = overlayRef.current.getContext('2d');
    ovCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    
    const rect = cropRect || maskRect;
    if (!rect || !rect.w || !rect.h) return;
    
    ovCtx.save();
    const color = cropRect ? '#fbbf24' : '#00e5ff';
    ovCtx.strokeStyle = color;
    ovCtx.lineWidth = 2;
    ovCtx.setLineDash([8, 4]);
    const fillColor = cropRect ? 'rgba(251, 191, 36, 0.08)' : 'rgba(0, 229, 255, 0.08)';
    ovCtx.fillStyle = fillColor;
    const rx = Math.min(rect.x, rect.x + rect.w);
    const ry = Math.min(rect.y, rect.y + rect.h);
    ovCtx.fillRect(rx, ry, Math.abs(rect.w), Math.abs(rect.h));
    ovCtx.strokeRect(rx, ry, Math.abs(rect.w), Math.abs(rect.h));
    ovCtx.restore();
  }, [cropRect, maskRect, CANVAS_W, CANVAS_H]);

  const getPos = (e) => {
    if (!e) return { x: 0, y: 0 };
    const rect = overlayRef.current.getBoundingClientRect();
    const scale = CANVAS_W / rect.width;
    const clientX = e.touches?.[0]?.clientX ?? e.clientX;
    const clientY = e.touches?.[0]?.clientY ?? e.clientY;
    if (clientX === undefined || clientY === undefined) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left) * scale,
      y: (clientY - rect.top) * scale,
    };
  };

  const applyStyle = (ctx, strokeOnly = false) => {
    ctx.globalAlpha = opacity / 100;
    ctx.strokeStyle = color;
    ctx.fillStyle = strokeOnly ? color : bgColor;
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  const onMouseDown = (e) => {
    e.preventDefault();
    const pos = getPos(e);
    const ctx = getCtx();
    if (!ctx) return;

    if (activeTool === 'text') {
      setTextInput(pos);
      return;
    }
    if (activeTool === 'eyedropper') {
      const disp = displayRef.current;
      const dCtx = disp.getContext('2d');
      const px = dCtx.getImageData(Math.round(pos.x), Math.round(pos.y), 1, 1).data;
      const hex = '#' + [px[0], px[1], px[2]].map(v => v.toString(16).padStart(2,'0')).join('');
      // bubble up via a custom event
      overlayRef.current.dispatchEvent(new CustomEvent('colorpicked', { detail: hex, bubbles: true }));
      return;
    }

    if (activeTool === 'crop') {
      drawing.current = true;
      shapeStart.current = pos;
      onCropChange && onCropChange(null);
      return;
    }

    if (activeTool === 'ai_mask') {
      drawing.current = true;
      shapeStart.current = pos;
      onMaskChange && onMaskChange(null);
      return;
    }

    snapshot();
    drawing.current = true;
    lastPos.current = pos;
    shapeStart.current = pos;

    if (activeTool === 'pencil' || activeTool === 'brush') {
      applyStyle(ctx);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    }
    if (activeTool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    }
  };

  const onMouseMove = (e) => {
    if (!drawing.current) return;
    const pos = getPos(e);
    const ctx = getCtx();
    if (!ctx) return;

    if (activeTool === 'pencil' || activeTool === 'brush') {
      applyStyle(ctx);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      lastPos.current = pos;
      redraw();
    }
    if (activeTool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      lastPos.current = pos;
      redraw();
    }
    if (activeTool === 'crop') {
      const s = shapeStart.current;
      const ov = overlayRef.current;
      const ovCtx = ov.getContext('2d');
      ovCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      ovCtx.save();
      ovCtx.strokeStyle = '#fbbf24';
      ovCtx.lineWidth = 2;
      ovCtx.setLineDash([8, 4]);
      ovCtx.fillStyle = 'rgba(251, 191, 36, 0.08)';
      ovCtx.fillRect(s.x, s.y, pos.x - s.x, pos.y - s.y);
      ovCtx.strokeRect(s.x, s.y, pos.x - s.x, pos.y - s.y);
      ovCtx.restore();
      return;
    }

    if (activeTool === 'ai_mask') {
      const s = shapeStart.current;
      const ov = overlayRef.current;
      const ovCtx = ov.getContext('2d');
      ovCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      // Animated dashed selection rect
      ovCtx.save();
      ovCtx.strokeStyle = '#00e5ff';
      ovCtx.lineWidth = 2;
      ovCtx.setLineDash([8, 4]);
      ovCtx.fillStyle = 'rgba(0, 229, 255, 0.08)';
      ovCtx.fillRect(s.x, s.y, pos.x - s.x, pos.y - s.y);
      ovCtx.strokeRect(s.x, s.y, pos.x - s.x, pos.y - s.y);
      ovCtx.restore();
      return;
    }
    if (['rect', 'circle', 'line'].includes(activeTool)) {
      // Draw preview on overlay
      const ov = overlayRef.current;
      const ovCtx = ov.getContext('2d');
      ovCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      ovCtx.globalAlpha = opacity / 100;
      ovCtx.strokeStyle = color;
      ovCtx.fillStyle = bgColor;
      ovCtx.lineWidth = brushSize;
      const s = shapeStart.current;
      if (activeTool === 'rect') {
        if (filled) ovCtx.fillRect(s.x, s.y, pos.x - s.x, pos.y - s.y);
        ovCtx.strokeRect(s.x, s.y, pos.x - s.x, pos.y - s.y);
      } else if (activeTool === 'circle') {
        ovCtx.beginPath();
        const rx = Math.abs(pos.x - s.x) / 2, ry = Math.abs(pos.y - s.y) / 2;
        ovCtx.ellipse(s.x + (pos.x - s.x) / 2, s.y + (pos.y - s.y) / 2, rx, ry, 0, 0, Math.PI * 2);
        if (filled) ovCtx.fill();
        ovCtx.stroke();
      } else if (activeTool === 'line') {
        ovCtx.beginPath();
        ovCtx.moveTo(s.x, s.y);
        ovCtx.lineTo(pos.x, pos.y);
        ovCtx.stroke();
      }
    }
  };

  const onMouseUp = (e) => {
    if (!drawing.current) return;
    drawing.current = false;
    const pos = getPos(e);
    const ctx = getCtx();
    if (!ctx) return;

    const s = shapeStart.current;

    if (activeTool === 'crop') {
      const rect = { x: Math.min(s.x, pos.x), y: Math.min(s.y, pos.y), w: Math.abs(pos.x - s.x), h: Math.abs(pos.y - s.y) };
      onCropChange && onCropChange(rect);
      drawing.current = false;
      return;
    }

    if (activeTool === 'ai_mask') {
      const rect = { x: s.x, y: s.y, w: pos.x - s.x, h: pos.y - s.y };
      onMaskChange && onMaskChange(rect);
      drawing.current = false;
      return;
    }

    if (['rect', 'circle', 'line'].includes(activeTool)) {
      applyStyle(ctx);
      if (activeTool === 'rect') {
        if (filled) ctx.fillRect(s.x, s.y, pos.x - s.x, pos.y - s.y);
        ctx.strokeRect(s.x, s.y, pos.x - s.x, pos.y - s.y);
      } else if (activeTool === 'circle') {
        ctx.beginPath();
        const rx = Math.abs(pos.x - s.x) / 2, ry = Math.abs(pos.y - s.y) / 2;
        ctx.ellipse(s.x + (pos.x - s.x) / 2, s.y + (pos.y - s.y) / 2, rx, ry, 0, 0, Math.PI * 2);
        if (filled) ctx.fill();
        ctx.stroke();
      } else if (activeTool === 'line') {
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
      }
      // Clear overlay
      const ovCtx = overlayRef.current.getContext('2d');
      ovCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    redraw();
  };

  const commitText = (text, pos) => {
    if (!text.trim()) { setTextInput(null); return; }
    const ctx = getCtx();
    if (!ctx) return;
    ctx.globalAlpha = opacity / 100;
    ctx.fillStyle = color;
    ctx.font = `${fontBold ? 'bold ' : ''}${fontSize}px sans-serif`;
    ctx.fillText(text, pos.x, pos.y);
    ctx.globalAlpha = 1;
    setTextInput(null);
    redraw();
  };

  const scale = zoom / 100;

  return (
    <div className="flex-1 overflow-auto bg-background flex items-center justify-center p-4">
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', position: 'relative', width: CANVAS_W, height: CANVAS_H }}>
        {/* Display canvas (composited layers) */}
        <canvas
          ref={displayRef}
          width={CANVAS_W}
          height={CANVAS_H}
          style={{ position: 'absolute', top: 0, left: 0, display: 'block', filter: filterString || 'none' }}
        />
        {/* Overlay canvas (shape preview) */}
        <canvas
          ref={overlayRef}
          width={CANVAS_W}
          height={CANVAS_H}
          style={{ position: 'absolute', top: 0, left: 0, display: 'block', cursor: getCursor(activeTool) }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onTouchStart={onMouseDown}
          onTouchMove={onMouseMove}
          onTouchEnd={onMouseUp}
        />
        {/* Text input overlay */}
        {textInput && (
          <input
            autoFocus
            style={{
              position: 'absolute',
              left: textInput.x,
              top: textInput.y - fontSize,
              background: 'transparent',
              border: '1px dashed #888',
              color: color,
              fontSize: fontSize,
              fontWeight: fontBold ? 'bold' : 'normal',
              outline: 'none',
              minWidth: 80,
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') commitText(e.target.value, textInput);
              if (e.key === 'Escape') setTextInput(null);
            }}
            onBlur={e => commitText(e.target.value, textInput)}
          />
        )}
      </div>
    </div>
  );
}

function getCursor(tool) {
  switch (tool) {
    case 'pencil': case 'brush': return 'crosshair';
    case 'eraser': return 'cell';
    case 'eyedropper': return 'copy';
    case 'text': return 'text';
    case 'crop': return 'crosshair';
    case 'rotate': return 'grab';
    case 'resize': return 'nwse-resize';
    case 'ai_mask': return 'crosshair';
    default: return 'default';
  }
}