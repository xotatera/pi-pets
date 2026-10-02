import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ExtensionAPI, ExtensionContext, Theme } from '@earendil-works/pi-coding-agent';
import { setCapabilities, type Component, type TUI } from '@earendil-works/pi-tui';
import extension from '../index.ts';
import fs from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { PetLibrary } from '../src/library.ts';
import { readPackageFiles } from '../src/archive.ts';
import { normalizePet } from '../src/pet-package.ts';

type Widget = Component & { dispose?(): void };
function host(mode = 'tui') {
  const handlers = new Map<string, (event: any, ctx: ExtensionContext) => any>();
  const commands = new Map<string, { handler: (args: string, ctx: any) => any }>();
  let widget: Widget | undefined;
  let renders = 0;
  const placements: string[] = [];
  const tui = { mode: 'regular', requestRender: () => renders++ } as unknown as TUI;
  const theme = { fg: (_: string, text: string) => text } as Theme;
  const ctx = { mode, cwd: process.cwd(), sessionManager: { getBranch: () => [] }, ui: { notify() {}, setWidget(key: string, factory: ((tui: TUI, theme: Theme) => Widget) | undefined, options?: { placement?: string }) {
    assert.equal(key, 'pi-pet');
    widget?.dispose?.();
    widget = factory?.(tui, theme);
    if (factory) placements.push(options?.placement ?? '');
  } } } as unknown as ExtensionContext;
  extension({ on: (name: string, handler: any) => handlers.set(name, handler), registerCommand: (name: string, command: any) => commands.set(name, command) } as unknown as ExtensionAPI);
  return {
    ctx, placements,
    emit: async (name: string, event: any = {}) => handlers.get(name)?.(event, ctx),
    toggle: async () => commands.get('pet')!.handler('', ctx),
    command: async (name: string, args = '') => commands.get(name)!.handler(args, ctx),
    text: () => widget?.render(80).join(''),
    get renders() { return renders; },
  };
}

test('extension: lifecycle reacts without agent_end overriding settlement', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  setCapabilities({ images: null, trueColor: true, hyperlinks: false });
  const pi = host();
  await pi.emit('session_start');
  try {
    assert.deepEqual(pi.placements, ['aboveEditor']);
    assert.match(pi.text()!, /idle/);
    await pi.emit('agent_start');
    assert.match(pi.text()!, /running/);
    await pi.emit('ui_prompt_start');
    assert.match(pi.text()!, /waiting/);
    await pi.emit('ui_prompt_end');
    await pi.emit('tool_execution_start', { toolCallId: 'a' });
    await pi.emit('tool_execution_end', { toolCallId: 'a', isError: true });
    assert.match(pi.text()!, /failed/);
    await pi.emit('agent_before_settle', { outcome: 'completed' });
    await pi.emit('agent_settled');
    await pi.emit('agent_end');
    assert.match(pi.text()!, /failed/);
    await pi.emit('agent_start');
    await pi.emit('agent_before_settle', { outcome: 'completed' });
    await pi.emit('agent_settled');
    assert.match(pi.text()!, /jumping/);
  } finally { await pi.emit('session_shutdown'); }
});

for (const mode of ['print', 'json', 'rpc']) {
  test(`extension: ${mode} creates no widget or timers`, async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const pi = host(mode);
    await pi.emit('session_start');
    await pi.toggle();
    t.mock.timers.tick(1000);
    assert.equal(pi.text(), undefined);
    assert.equal(pi.renders, 0);
    assert.equal(pi.placements.length, 0);
    await pi.emit('session_shutdown');
  });
}

test('extension: toggle and repeated session starts dispose old widgets', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  setCapabilities({ images: null, trueColor: true, hyperlinks: false });
  const pi = host();
  await pi.emit('session_start');
  await pi.toggle();
  assert.equal(pi.text(), undefined);
  t.mock.timers.tick(1000);
  assert.equal(pi.renders, 0);
  await pi.toggle();
  assert.match(pi.text()!, /idle/);
  await pi.emit('session_start');
  t.mock.timers.tick(200);
  assert.equal(pi.renders, 1, 'only the replacement widget should tick');
  await pi.emit('session_shutdown');
  await pi.emit('session_shutdown');
  t.mock.timers.tick(1000);
  assert.equal(pi.text(), undefined);
  assert.equal(pi.renders, 1);
});

test('extension: switch changes pet name immediately without losing activity and restores globally', async (t) => {
  const root = await fs.mkdtemp(join(tmpdir(), 'pet-extension-'));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = root;
  t.mock.timers.enable({ apis: ['setInterval'] });
  setCapabilities({ images: null, trueColor: true, hyperlinks: false });
  const pi = host();
  try {
    const library = new PetLibrary(root, resolve('assets'));
    const installed = await library.install(await normalizePet(await readPackageFiles('assets'), 'Sample pet'));
    await pi.emit('session_start');
    await pi.emit('agent_start');
    await pi.command('pet-switch', installed.id);
    assert.match(pi.text()!, /Sample pet · running/);
    await pi.emit('session_shutdown');
    await pi.emit('session_start');
    assert.match(pi.text()!, /Sample pet · idle/);
    await pi.command('pet-switch', 'bundled-pi');
    assert.match(pi.text()!, /Pi · idle/);
  } finally {
    await pi.emit('session_shutdown');
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
    await fs.rm(root, { recursive: true, force: true });
  }
});
