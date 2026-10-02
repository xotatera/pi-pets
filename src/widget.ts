import type { Theme } from '@earendil-works/pi-coding-agent';
import { Image, getCapabilities, truncateToWidth, type Component, type TUI } from '@earendil-works/pi-tui';
import type { Animation, FrameLibrary } from './assets.ts';
import type { PetController } from './state.ts';
import type { PetConfig } from './config.ts';

/** One session-owned animation timer; all drawing goes through Pi's renderer. */
export function createPetWidget(tui: TUI, theme: Theme, frames: FrameLibrary | null, controller: PetController, config: PetConfig, name = 'Pi'): Component & { dispose(): void } {
  let disposed = false;
  let image: Image | undefined;
  let key = '';
  let imageId: number | undefined;
  const counts = frames && Object.fromEntries(Object.entries(frames).map(([state, images]) => [state, images.length])) as Record<Animation, number>;
  const timer = setInterval(() => { if (!disposed) tui.requestRender(); }, config.frameMs);
  timer.unref();
  return {
    render(width: number): string[] {
      if (disposed || width <= 0) return [];
      const { animation, index } = controller.frame(performance.now(), counts || undefined);
      const label = truncateToWidth(theme.fg('muted', `π ${name} · ${animation}`), width);
      const protocol = getCapabilities().images;
      // Pi's fullscreen renderer cannot safely repaint iTerm2 placements.
      if (!frames || !protocol || width < 4 || (tui.mode === 'fullscreen' && protocol === 'iterm2')) return [label];
      const nextKey = `${animation}/${index}/${protocol}`;
      if (!image || key !== nextKey) {
        imageId = image?.getImageId() ?? imageId;
        image = new Image(frames[animation][index], 'image/png', { fallbackColor: text => theme.fg('muted', text) }, {
          maxWidthCells: 10, maxHeightCells: config.maxHeightCells, imageId,
        });
        key = nextKey;
      }
      return [...image.render(width), label];
    },
    invalidate(): void { image?.invalidate(); },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      clearInterval(timer);
      image = undefined;
    },
  };
}