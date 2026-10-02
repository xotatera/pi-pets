import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ExtensionAPI, ExtensionContext, Theme } from '@earendil-works/pi-coding-agent';
import { setCapabilities, type TUI, type Component } from '@earendil-works/pi-tui';
import extension from '../index.ts';
import { PetLibrary } from '../src/library.ts';

test('startup: missing bundled artwork warns and still renders a live Pi text fallback', async t => {
  const root = await fs.mkdtemp(join(tmpdir(), 'pet-text-fallback-'));
  const handlers = new Map<string, (event: any, ctx: ExtensionContext) => Promise<void>>();
  let widget: (Component & { dispose?(): void }) | undefined;
  const notices: string[] = [];
  const ctx = { mode: 'tui', sessionManager: { getBranch: () => [] }, ui: {
    notify: (message: string) => notices.push(message),
    setWidget: (_key: string, factory: any) => { widget?.dispose?.(); widget = factory?.({ mode: 'regular', requestRender() {} } as TUI, { fg: (_key: string, value: string) => value } as Theme); },
  } } as unknown as ExtensionContext;
  const load = PetLibrary.prototype.loadSelected;
  t.mock.method(PetLibrary.prototype, 'loadSelected', function() { return load.call(new PetLibrary(root, join(root, 'missing-assets'))); });
  t.mock.timers.enable({ apis: ['setInterval'] });
  setCapabilities({ images: null, trueColor: true, hyperlinks: false });
  extension({ on: (name: string, handler: any) => handlers.set(name, handler), registerCommand() {} } as unknown as ExtensionAPI);
  try {
    await handlers.get('session_start')!({}, ctx);
    assert.match(widget!.render(80).join(''), /Pi · idle/);
    assert.match(notices.join('\n'), /artwork.*text fallback/i);
    await handlers.get('agent_start')!({}, ctx);
    assert.match(widget!.render(80).join(''), /Pi · running/);
  } finally {
    await handlers.get('session_shutdown')!({}, ctx);
    t.mock.restoreAll(); await fs.rm(root, { recursive: true, force: true });
  }
});
