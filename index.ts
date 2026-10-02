import { fileURLToPath } from 'node:url';
import { getAgentDir, type ExtensionAPI, type ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { FrameLibrary } from './src/assets.ts';
import { PetLibrary, type LoadedPet } from './src/library.ts';
import { registerPetCommands } from './src/pet-commands.ts';
import { PetController, type PetEvent } from './src/state.ts';
import { createPetWidget } from './src/widget.ts';
import { defaultConfig, loadConfig, saveConfig, CONFIG_ENTRY_TYPE } from './src/config.ts';

export default function extension(pi: ExtensionAPI): void {
  let controller = new PetController(defaultConfig);
  let frames: FrameLibrary | null = null;
  let context: ExtensionContext | undefined;
  let widget: ReturnType<typeof createPetWidget> | undefined;
  let visible = true;
  let config = defaultConfig;
  let generation = 0;
  let pendingOutcome: PetEvent['outcome'];
  let selected: LoadedPet | undefined;
  const library = new PetLibrary(getAgentDir(), fileURLToPath(new URL('./assets/', import.meta.url)));

  function remove(): void {
    widget?.dispose();
    widget = undefined;
    context?.ui.setWidget('pi-pet', undefined);
  }
  function show(): void {
    if (!context || !visible) return;
    context.ui.setWidget('pi-pet', (tui, theme) => {
      widget?.dispose();
      widget = createPetWidget(tui, theme, frames, controller, config, selected?.name ?? 'Pi');
      return widget;
    }, { placement: config.placement });
  }
  function update(event: PetEvent): void {
    if (context) controller.handle(event, performance.now());
  }
  async function refreshConfig(): Promise<void> {
    config = await loadConfig(context!);
    controller = new PetController(config);
    if (widget) {
      widget.dispose();
      widget = undefined;
      show();
    }
  }

  pi.on('session_start', async (_event, ctx) => {
    const current = ++generation;
    remove();
    context = undefined;
    controller = new PetController(defaultConfig);
    pendingOutcome = undefined;
    if (ctx.mode !== 'tui') return;
    let loaded: Awaited<ReturnType<PetLibrary['loadSelected']>> | undefined;
    let warning: string | undefined;
    try { loaded = await library.loadSelected(); warning = loaded.warning; }
    catch (error) { warning = `Artwork unavailable; using Pi text fallback: ${String(error)}`; }
    const loadedConfig = await loadConfig(ctx);
    if (current !== generation) return;
    selected = loaded?.pet;
    frames = loaded?.pet.frames ?? null;
    context = ctx;
    config = loadedConfig;
    if (warning) ctx.ui.notify(warning, 'warning');
    controller = new PetController(config);
    visible = config.visible;
    if (visible) show();
  });
  pi.on('session_shutdown', () => {
    generation++;
    remove();
    context = undefined;
    selected = undefined;
  });
  registerPetCommands(pi, library, {
    current: () => selected,
    generation: () => generation,
    apply: pet => {
      selected = pet;
      frames = pet.frames;
      remove();
      show();
    },
  });

  // --- hyphenated commands ---
  pi.registerCommand('pet', {
    description: 'Show or hide the animated Pi companion',
    handler: async () => {
      if (!context) return;
      visible = !visible;
      if (visible) show(); else remove();
    },
  });
  pi.registerCommand('pet-wave', {
    description: 'Make the pet wave briefly',
    handler: async () => {
      if (!context) return;
      update({ type: 'manual', animation: 'waving' });
    },
  });
  pi.registerCommand('pet-jump', {
    description: 'Make the pet jump briefly',
    handler: async () => {
      if (!context) return;
      update({ type: 'manual', animation: 'jumping' });
    },
  });
  pi.registerCommand('pet-feed', {
    description: 'Feed the pet (plays jumping animation)',
    handler: async () => {
      if (!context) return;
      context.ui.notify('🍖 Fed the Pi pet!', 'info');
      update({ type: 'manual', animation: 'jumping' });
    },
  });
  pi.registerCommand('pet-play', {
    description: 'Play with the pet (plays waving animation)',
    handler: async () => {
      if (!context) return;
      context.ui.notify('🎾 Playing with the Pi pet!', 'info');
      update({ type: 'manual', animation: 'waving' });
    },
  });
  pi.registerCommand('pet-config', {
    description: 'Customize pet animation speed, size, placement, and reaction durations',
    handler: async () => {
      if (!context) return;
      await refreshConfig();
      const placement = await context.ui.select('Widget placement', ['aboveEditor', 'belowEditor'], {});
      if (!placement) return;
      const visibleChoice = await context.ui.select('Default visibility', ['visible', 'hidden'], {});
      if (!visibleChoice) return;
      const frameMsInput = await context.ui.input('Animation frame period (ms, 50-500)', String(config.frameMs));
      if (!frameMsInput) return;
      const frameMs = Math.max(50, Math.min(500, Number(frameMsInput) || config.frameMs));
      const reviewMsInput = await context.ui.input('Review reaction duration (ms, 200-3000)', String(config.durations.review));
      if (!reviewMsInput) return;
      const reviewMs = Math.max(200, Math.min(3000, Number(reviewMsInput) || config.durations.review));
      const failedMsInput = await context.ui.input('Failed reaction duration (ms, 200-5000)', String(config.durations.failed));
      if (!failedMsInput) return;
      const failedMs = Math.max(200, Math.min(5000, Number(failedMsInput) || config.durations.failed));
      const jumpMsInput = await context.ui.input('Jump reaction duration (ms, 200-5000)', String(config.durations.jump));
      if (!jumpMsInput) return;
      const jumpMs = Math.max(200, Math.min(5000, Number(jumpMsInput) || config.durations.jump));
      const heightInput = await context.ui.input('Max widget height in cell rows (1-8)', String(config.maxHeightCells));
      if (!heightInput) return;
      const maxHeightCells = Math.max(1, Math.min(8, Number(heightInput) || config.maxHeightCells));

      config = { ...config, placement: placement as 'aboveEditor' | 'belowEditor', visible: visibleChoice === 'visible', frameMs, durations: { review: reviewMs, failed: failedMs, jump: jumpMs }, maxHeightCells };
      pi.appendEntry(CONFIG_ENTRY_TYPE, config);
      await refreshConfig();
      context.ui.notify('Pet configuration saved', 'info');
    },
  });
  // --- lifecycle ---
  pi.on('agent_start', () => { pendingOutcome = undefined; update({ type: 'agent_start' }); });
  pi.on('tool_execution_start', () => update({ type: 'tool_start' }));
  pi.on('tool_execution_end', event => update({ type: 'tool_end', error: event.isError }));
  pi.on('ui_prompt_start', () => update({ type: 'prompt_start' }));
  pi.on('ui_prompt_end', () => update({ type: 'prompt_end' }));
  pi.on('agent_before_settle', event => { pendingOutcome = event.outcome; });
  pi.on('agent_settled', () => {
    update({ type: 'settle', outcome: pendingOutcome });
    pendingOutcome = undefined;
  });
}