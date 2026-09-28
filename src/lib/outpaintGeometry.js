export function calculateOutpaintGeometry(width, height, percent, direction) {
  const w = Number(width);
  const h = Number(height);
  const pct = Number(percent);
  if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0) {
    throw new Error('OUTPAINT_INVALID_CANVAS_SIZE');
  }
  if (!Number.isFinite(pct) || pct <= 0 || pct > 300) {
    throw new Error('OUTPAINT_INVALID_PERCENT');
  }

  const expandX = Math.max(1, Math.round((pct / 100) * w));
  const expandY = Math.max(1, Math.round((pct / 100) * h));
  let newW = w;
  let newH = h;
  let offsetX = 0;
  let offsetY = 0;

  if (direction === 'left') {
    newW += expandX;
    offsetX = expandX;
  } else if (direction === 'right') {
    newW += expandX;
  } else if (direction === 'up') {
    newH += expandY;
    offsetY = expandY;
  } else if (direction === 'down') {
    newH += expandY;
  } else if (direction === 'all') {
    newW += expandX * 2;
    newH += expandY * 2;
    offsetX = expandX;
    offsetY = expandY;
  } else {
    throw new Error('OUTPAINT_INVALID_DIRECTION');
  }

  return { newW, newH, offsetX, offsetY, expandX, expandY };
}
