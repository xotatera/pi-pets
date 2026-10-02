/** User-configurable pet settings, persisted across sessions. */
export interface PetConfig {
  /** Animation frame period in ms. */
  frameMs: number;
  /** Transient reaction durations in ms. */
  durations: {
    review: number;
    failed: number;
    jump: number;
  };
  /** Widget placement. */
  placement: 'aboveEditor' | 'belowEditor';
  /** Whether the widget is visible by default. */
  visible: boolean;
  /** Maximum widget height in cell rows. */
  maxHeightCells: number;
}

/** Default configuration. */
export const defaultConfig: PetConfig = {
  frameMs: 200,
  durations: { review: 800, failed: 1200, jump: 800 },
  placement: 'aboveEditor',
  visible: true,
  maxHeightCells: 4,
};

/** Storage key for the pet config entry. */
export const CONFIG_ENTRY_TYPE = 'pi-pet-config';

/** Load config from session storage, falling back to defaults. */
export async function loadConfig(ctx: { sessionManager: { getBranch(): any[] } }): Promise<PetConfig> {
  try {
    const entries = ctx.sessionManager?.getBranch?.() ?? [];
    for (const entry of entries) {
      if (entry.type === 'custom' && entry.customType === CONFIG_ENTRY_TYPE && entry.data) {
        return { ...defaultConfig, ...entry.data };
      }
    }
  } catch { /* ignore */ }
  return defaultConfig;
}

/** Save config to session storage. */
export function saveConfig(ctx: { appendEntry<T = unknown>(customType: string, data?: T): void }, config: PetConfig): void {
  ctx.appendEntry(CONFIG_ENTRY_TYPE, config);
}