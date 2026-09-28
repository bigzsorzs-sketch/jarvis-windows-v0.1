import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVoiceCommand, localDateString, inferTimeOfDay } from '../lib/voiceCommandParser.js';

const evening = new Date(2026,8,27,20,15,0);

test('displayed voice examples parse locally without AI fallback', () => {
  assert.equal(parseVoiceCommand('Ma költöttem 2000 forintot ebédre', evening)?.type,'create_expense');

  const sugar = parseVoiceCommand('Ma reggel 5.8 volt a vércukrom', evening);
  assert.equal(sugar?.type,'create_blood_sugar');
  assert.equal(sugar.payload.value,5.8);
  assert.equal(sugar.payload.time_of_day,'reggel');
  assert.equal(sugar.payload.date,'2026-09-27');

  const meal = parseVoiceCommand('Ebédre ettem levest 400 kalória', evening);
  assert.equal(meal?.type,'create_meal');
  assert.equal(meal.payload.meal_type,'ebéd');
  assert.equal(meal.payload.calories,400);

  const todo = parseVoiceCommand('Teendő: vegyél tejet', evening);
  assert.equal(todo?.type,'create_todo');
  assert.equal(todo.payload.title,'Vegyél tejet');

  assert.equal(parseVoiceCommand('Navigálj TESCO-ba', evening)?.type,'navigate');
});

test('voice dates use local calendar date and time of day', () => {
  const localMidnight = new Date(2026,0,2,0,30,0);
  assert.equal(localDateString(localMidnight),'2026-01-02');
  assert.equal(inferTimeOfDay('',localMidnight),'éjjel');
  assert.equal(inferTimeOfDay('délután',evening),'délután');
});
