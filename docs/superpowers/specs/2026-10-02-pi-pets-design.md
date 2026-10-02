# Pi Pets — design

## Intent and success

Create a standalone Pi extension that displays an original, animated Pi-shaped creature throughout an interactive session. It reacts to agent activity without changing prompts, tools, or model behavior. The user supplied `Pi-export.zip`: a finished rounded pixel-art mascot using coral `#F09082`, blue `#4D9ABF`, and gold `#F1BE58`. Use that artwork, not a generic animal or a downloaded Codex pet. A successful installation shows the pet automatically beside the editor on supported terminals and safely degrades elsewhere.

## Packaging and artwork

This is a new Pi extension project. Bundle only the required transparent PNG frames from `Pi-export.zip` (the archive's `frames/` tree) and a compact asset manifest mapping named states to ordered frames. Keep the ZIP itself out of the published package. The supplied atlas, previews, and look-direction frames are reference/source material, not required runtime files for v1; the first release uses idle, running, waiting, review, failed, jumping, and optionally waving frames. Preserve the archive untouched. Include installation instructions for loading the extension by path or as a Pi package, and document asset provenance and licensing without inventing permissions.

## Components and data flow

- **State controller:** a small pure module accepts lifecycle inputs and returns the current animation, transient duration, and next state. `agent_start` starts running; tool completion briefly shows review on success or failed on error; a user-facing wait shows waiting; a completed run briefly jumps, then idles. If the run outcome is aborted or errored, show failed instead of celebrating. New activity supersedes any transient animation. Prefer an available outcome-bearing boundary event for the final outcome and avoid inferring success solely from `agent_end`. Idle applies when there is no active run.
- **Frame loader:** reads the bundled frames once at interactive session start, validates frame availability, and caches encoded PNGs. Errors do not prevent Pi from starting; use a textual fallback.
- **Widget renderer:** install a persistent `ctx.ui.setWidget` component above the editor. Each tick selects one frame and renders it using `@earendil-works/pi-tui`'s `Image` component with constrained dimensions and, where supported, a reusable Kitty image ID. The timer calls the TUI's render request rather than writing escape sequences directly. Use a small fixed widget footprint, handle terminal resize, and never seize keyboard focus. When terminal inline images are unavailable, show a one-line text mascot/status; do not attempt a separate desktop window.
- **Lifecycle:** set up widget and timer only in `session_start` with `ctx.mode === "tui"`; remove widget and clear timer on `session_shutdown` and on disposable component teardown. Skip timers and UI rendering in print/JSON modes. A `/pet` command can toggle visibility without affecting agent activity. No networking, external model calls, or mutation of user files.

## Rendering boundaries

Pi's TUI supports inline PNG on Kitty-compatible terminals (including Kitty/Ghostty/WezTerm) and iTerm2 in the regular screen. Alternate-screen iTerm2 may use a text placeholder because its protocol lacks Pi's required image deletion/cropping semantics. Keep animation rate conservative and make frame updates deterministic to avoid excess traffic or stale images. A text fallback is acceptable wherever Pi's own image capability check rejects graphics.

## Error handling and tests

Unit-test state transitions, interruption precedence, frame ordering, and missing-asset fallback without a terminal. Test the extension's startup, widget registration, toggle, and idempotent cleanup with a mocked Pi API. Run type checks and test suite. Smoke-test `pi --extension ./...` in interactive mode; manually inspect Kitty-compatible output, resize, and shutdown if a compatible interactive terminal is available. If such a terminal is unavailable, report the visual check as unverified rather than claiming it passed. No art generation or automatic pet downloads are in scope.
