import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PetController } from '../src/state.ts';

test('state: continuation preserves a failed tool until the whole run settles', () => {
  const pet = new PetController();
  pet.handle({ type: 'agent_start' }, 0);
  pet.handle({ type: 'tool_start' }, 10);
  pet.handle({ type: 'tool_end', error: true }, 20);
  // Pi emits another agent_start when a before-settle handler requests continuation.
  pet.handle({ type: 'agent_start' }, 30);
  pet.handle({ type: 'tool_start' }, 40);
  pet.handle({ type: 'tool_end' }, 50);
  pet.handle({ type: 'settle', outcome: 'completed' }, 60);
  assert.equal(pet.frame(60).animation, 'failed');
  pet.handle({ type: 'agent_start' }, 2000);
  pet.handle({ type: 'settle', outcome: 'completed' }, 2100);
  assert.equal(pet.frame(2100).animation, 'jumping');
});
