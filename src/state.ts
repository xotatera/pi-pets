import { frameCounts, type Animation } from './assets.ts';
import { defaultConfig, type PetConfig } from './config.ts';

export type PetEvent = {
  type: 'agent_start' | 'tool_start' | 'tool_end' | 'prompt_start' | 'prompt_end' | 'settle' | 'manual';
  animation?: 'waving' | 'jumping';
  error?: boolean;
  outcome?: 'completed' | 'aborted' | 'error';
};

/** Pure timestamp-driven state; no timers and no dependency on Pi's event API. */
export class PetController {
  private readonly config: PetConfig;
  private active = false;
  private tools = 0;
  private prompts = 0;
  private errored = false;
  private transient?: { animation: Animation; since: number; until: number };
  private started = 0;

  constructor(config?: Partial<PetConfig>) {
    this.config = {
      ...defaultConfig,
      ...config,
      durations: { ...defaultConfig.durations, ...config?.durations },
    };
  }

  handle(input: PetEvent, now: number): void {
    switch (input.type) {
      case 'manual':
        this.react(input.animation ?? 'waving', now, input.animation === 'jumping' ? this.config.durations.jump : this.config.durations.review);
        break;
      case 'agent_start':
        if (!this.active) this.errored = false;
        this.active = true;
        this.tools = 0;
        this.transient = undefined;
        this.started = now;
        break;
      case 'tool_start':
        this.tools++;
        this.transient = undefined;
        this.started = now;
        break;
      case 'tool_end':
        this.tools = Math.max(0, this.tools - 1);
        if (input.error) {
          this.errored = true;
          this.react('failed', now, this.config.durations.failed);
        } else if (this.tools === 0) this.react('review', now, this.config.durations.review);
        break;
      case 'prompt_start': this.prompts++; this.started = now; break;
      case 'prompt_end': this.prompts = Math.max(0, this.prompts - 1); this.started = now; break;
      case 'settle':
        this.active = false;
        this.tools = 0;
        this.react(input.outcome === 'completed' && !this.errored ? 'jumping' : 'failed', now,
          input.outcome === 'completed' && !this.errored ? this.config.durations.jump : this.config.durations.failed);
        break;
    }
  }

  private react(animation: Animation, now: number, duration: number): void {
    this.transient = { animation, since: now, until: now + duration };
  }

  frame(now: number, counts: Record<Animation, number> = frameCounts): { animation: Animation; index: number } {
    const reaction = this.transient && now < this.transient.until ? this.transient : undefined;
    const animation: Animation = this.prompts > 0 ? 'waiting'
      : reaction?.animation ?? (this.active || this.tools > 0 ? 'running' : 'idle');
    const since = this.prompts > 0 ? this.started : reaction?.since ?? this.started;
    return { animation, index: Math.floor(Math.max(0, now - since) / this.config.frameMs) % counts[animation] };
  }
}