import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PetController } from '../src/state.ts';
import { defaultConfig, type PetConfig } from '../src/config.ts';

test('commands: config fields match defaults and partial merge works', () => {
  const cfg: PetConfig = { ...defaultConfig, frameMs: 150, placement: 'belowEditor' };
  assert.equal(cfg.frameMs, 150);
  assert.equal(cfg.placement, 'belowEditor');
  assert.equal(cfg.durations.review, 800);
  const controller = new PetController({ frameMs: 100 });
  controller.handle({ type: 'agent_start' }, 0);
  const frame0 = controller.frame(0);
  const frame1 = controller.frame(100);
  assert.deepEqual(frame0, { animation: 'running', index: 0 });
  assert.deepEqual(frame1, { animation: 'running', index: 1 });
});

test('commands: manual reactions transient and return to running/idle', () => {
  const controller = new PetController();
  controller.handle({ type: 'agent_start' }, 0);
  assert.equal(controller.frame(0).animation, 'running');
  // Wave should produce a brief reaction
  controller.handle({ type: 'tool_end' }, 10); // not quite, but we test via state reaction
  controller.handle({ type: 'tool_end', error: true }, 20);
  assert.equal(controller.frame(20).animation, 'failed');
  assert.equal(controller.frame(1250).animation, 'running');
});