import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateOutpaintGeometry } from '../lib/outpaintGeometry.js';

test('outpaint geometry uses the correct axis and offset in every direction', () => {
  assert.deepEqual(
    calculateOutpaintGeometry(1000,500,30,'right'),
    {newW:1300,newH:500,offsetX:0,offsetY:0,expandX:300,expandY:150}
  );
  assert.deepEqual(
    calculateOutpaintGeometry(1000,500,30,'left'),
    {newW:1300,newH:500,offsetX:300,offsetY:0,expandX:300,expandY:150}
  );
  assert.deepEqual(
    calculateOutpaintGeometry(1000,500,30,'up'),
    {newW:1000,newH:650,offsetX:0,offsetY:150,expandX:300,expandY:150}
  );
  assert.deepEqual(
    calculateOutpaintGeometry(1000,500,30,'down'),
    {newW:1000,newH:650,offsetX:0,offsetY:0,expandX:300,expandY:150}
  );
  assert.deepEqual(
    calculateOutpaintGeometry(1000,500,30,'all'),
    {newW:1600,newH:800,offsetX:300,offsetY:150,expandX:300,expandY:150}
  );
});

test('outpaint geometry rejects invalid input', () => {
  assert.throws(()=>calculateOutpaintGeometry(0,500,30,'right'),/OUTPAINT_INVALID_CANVAS_SIZE/);
  assert.throws(()=>calculateOutpaintGeometry(1000,500,0,'right'),/OUTPAINT_INVALID_PERCENT/);
  assert.throws(()=>calculateOutpaintGeometry(1000,500,30,'diagonal'),/OUTPAINT_INVALID_DIRECTION/);
});
