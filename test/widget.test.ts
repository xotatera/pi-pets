import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setCapabilities, visibleWidth, type TUI } from '@earendil-works/pi-tui';
import type { Theme } from '@earendil-works/pi-coding-agent';
import { loadFrames } from '../src/assets.ts';
import { PetController } from '../src/state.ts';
import { createPetWidget } from '../src/widget.ts';
import { defaultConfig } from '../src/config.ts';

const theme = { fg: (_: string, text: string) => text } as Theme;

for (const graphics of [null, 'kitty', 'iterm2'] as const) {
  test(`widget: ${graphics ?? 'text'} renders bounded lines and updates on ticks`, async (t) => {
    const frames = await loadFrames('assets');
    assert.ok(frames);
    setCapabilities({ images: graphics, trueColor: true, hyperlinks: false });
    t.mock.timers.enable({ apis: ['setInterval'] });
    let now = 0;
    t.mock.method(performance, 'now', () => now);
    let renders = 0;
    const tui = { mode: 'regular', requestRender: () => renders++ } as unknown as TUI;
    const controller = new PetController();
    const widget = createPetWidget(tui, theme, frames, controller, defaultConfig);
    try {
      const lines = widget.render(80);
      assert.ok(lines.length <= 5);
      if (graphics === 'kitty') assert.match(lines.join(''), /\x1b_G/);
      else if (graphics === 'iterm2') assert.match(lines.join(''), /1337;File=/);
      else assert.match(lines.join(''), /Pi.*idle/);
      for (const width of [0, 1, 2, 8]) {
        for (const line of widget.render(width)) {
          // OSC 1337 is an image payload, not visible text columns.
          if (!line.includes('\u001b]1337;File=')) assert.ok(visibleWidth(line) <= width);
          else assert.match(line, /width=6;height=auto/);
        }
      }
      controller.handle({ type: 'agent_start' }, 0);
      now = 200;
      t.mock.timers.tick(200);
      assert.equal(renders, 1);
      const updated = widget.render(80).join('');
      if (!graphics) assert.match(updated, /running/);
      else assert.notEqual(updated, lines.join(''));
      if (graphics === 'kitty') {
        const first = lines.join('').match(/i=(\d+)/)?.[1];
        assert.ok(first);
        assert.equal(updated.match(/i=(\d+)/)?.[1], first);
      }
      widget.dispose(); widget.dispose();
      now = 400;
      t.mock.timers.tick(200);
      assert.equal(renders, 1, 'disposed widgets must stop requesting renders');
    } finally { widget.dispose(); }
  });
}

test('widget: variable-length selected tracks render the ninth frame', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: false });
  const frames = await loadFrames('assets'); assert.ok(frames);
  const controller = new PetController(); controller.handle({ type: 'agent_start' }, 0);
  const custom = { ...frames, running: Array.from({ length: 9 }, (_, i) => i === 8 ? frames.idle[1] : frames.idle[0]) };
  let now = 0; t.mock.method(performance, 'now', () => now);
  const widget = createPetWidget({ mode: 'regular', requestRender() {} } as TUI, theme, custom, controller, defaultConfig);
  try {
    now = 1600;
    assert.ok(widget.render(80).join(''));
    assert.deepEqual(controller.frame(1600, { idle: 6, running: custom.running.length, waiting: 6, review: 6, failed: 8, jumping: 5, waving: 4 }), { animation: 'running', index: 8 });
  } finally { widget.dispose(); }
});

test('widget: missing artwork gives compact text fallback', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: false });
  const widget = createPetWidget({ mode: 'regular', requestRender() {} } as TUI, theme, null, new PetController(), defaultConfig);
  try { assert.match(widget.render(80).join(''), /Pi.*idle/); assert.equal(widget.render(80).length, 1); }
  finally { widget.dispose(); }
});

test('widget: iTerm2 fullscreen uses readable one-line text not stale image', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  setCapabilities({ images: 'iterm2', trueColor: true, hyperlinks: false });
  const widget = createPetWidget({ mode: 'fullscreen', requestRender() {} } as TUI, theme, await loadFrames('assets'), new PetController(), defaultConfig);
  try {
    assert.match(widget.render(80).join(''), /Pi.*idle/);
    assert.doesNotMatch(widget.render(80).join(''), /1337;File=/);
  } finally { widget.dispose(); }
});
