import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PetController } from '../src/state.ts';

test('state: custom track sizes reach last frame and single frames never overflow', () => {
  const pet = new PetController();
  const counts = { idle: 1, running: 9, waiting: 3, review: 3, failed: 3, jumping: 3, waving: 3 };
  assert.equal(pet.frame(1600, counts).index, 0);
  pet.handle({ type: 'agent_start' }, 0);
  assert.equal(pet.frame(1600, counts).index, 8);
  assert.equal(pet.frame(1800, counts).index, 0);
});

test('state: idle frames advance, wrap and clamp negative time', () => {
  const pet = new PetController();
  assert.deepEqual(pet.frame(0), { animation: 'idle', index: 0 });
  assert.deepEqual(pet.frame(200), { animation: 'idle', index: 1 });
  assert.deepEqual(pet.frame(1200), { animation: 'idle', index: 0 });
  assert.deepEqual(pet.frame(-1), { animation: 'idle', index: 0 });
});

test('state: agent work and nested prompts resume correctly', () => {
  const pet = new PetController();
  pet.handle({ type: 'agent_start' }, 0);
  assert.equal(pet.frame(0).animation, 'running');
  pet.handle({ type: 'prompt_start' }, 20);
  pet.handle({ type: 'prompt_start' }, 30);
  pet.handle({ type: 'prompt_end' }, 40);
  assert.equal(pet.frame(50).animation, 'waiting');
  pet.handle({ type: 'prompt_end' }, 60);
  assert.equal(pet.frame(60).animation, 'running');
});

test('state: overlapping tools stay busy until all finish then review', () => {
  const pet = new PetController();
  pet.handle({ type: 'agent_start' }, 0);
  pet.handle({ type: 'tool_start' }, 10);
  pet.handle({ type: 'tool_start' }, 20);
  pet.handle({ type: 'tool_end' }, 30);
  assert.equal(pet.frame(30).animation, 'running');
  pet.handle({ type: 'tool_end' }, 40);
  assert.deepEqual(pet.frame(40), { animation: 'review', index: 0 });
  assert.equal(pet.frame(840).animation, 'running');
});

for (const outcome of ['completed', 'aborted', 'error'] as const) {
  test(`state: ${outcome} settlement has correct reaction then idles`, () => {
    const pet = new PetController();
    pet.handle({ type: 'agent_start' }, 0);
    pet.handle({ type: 'settle', outcome }, 200);
    assert.equal(pet.frame(200).animation, outcome === 'completed' ? 'jumping' : 'failed');
    assert.equal(pet.frame(2000).animation, 'idle');
  });
}

test('state: failed tool cannot be celebrated even after later success', () => {
  const pet = new PetController();
  pet.handle({ type: 'agent_start' }, 0);
  pet.handle({ type: 'tool_start' }, 10);
  pet.handle({ type: 'tool_end', error: true }, 20);
  assert.equal(pet.frame(20).animation, 'failed');
  pet.handle({ type: 'tool_start' }, 30);
  pet.handle({ type: 'tool_end' }, 40);
  pet.handle({ type: 'settle', outcome: 'completed' }, 50);
  assert.equal(pet.frame(50).animation, 'failed');
  pet.handle({ type: 'agent_start' }, 60);
  assert.equal(pet.frame(60).animation, 'running');
  pet.handle({ type: 'settle', outcome: 'completed' }, 70);
  assert.equal(pet.frame(70).animation, 'jumping');
});

test('state: new activity supersedes a reaction and restarts frames', () => {
  const pet = new PetController();
  pet.handle({ type: 'agent_start' }, 0);
  pet.handle({ type: 'settle', outcome: 'completed' }, 100);
  pet.handle({ type: 'agent_start' }, 110);
  assert.deepEqual(pet.frame(110), { animation: 'running', index: 0 });
  pet.handle({ type: 'tool_end' }, 120);
  pet.handle({ type: 'tool_start' }, 130);
  assert.deepEqual(pet.frame(130), { animation: 'running', index: 0 });
});

test('state: prompt waiting wins over reactions until dismissed', () => {
  const pet = new PetController();
  pet.handle({ type: 'agent_start' }, 0);
  pet.handle({ type: 'prompt_start' }, 10);
  pet.handle({ type: 'tool_end', error: true }, 20);
  assert.equal(pet.frame(20).animation, 'waiting');
  pet.handle({ type: 'settle', outcome: 'error' }, 30);
  assert.equal(pet.frame(5000).animation, 'waiting');
  pet.handle({ type: 'prompt_end' }, 5001);
  assert.equal(pet.frame(5001).animation, 'idle');
});
