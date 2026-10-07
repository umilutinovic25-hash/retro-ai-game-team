export type CountdownLabel = "3" | "2" | "1" | "GO!";

export type CountdownOptions = {
  stepMs: number;
  hideAfterMs?: number;
  onLabel: (label: CountdownLabel) => void;
  onHide: () => void;
  schedule?: (fn: () => void, ms: number) => unknown;
  cancelScheduled?: (handle: unknown) => void;
};

export function createCountdown(options: CountdownOptions) {
  const schedule = options.schedule ?? ((fn: () => void, ms: number) => window.setTimeout(fn, ms));
  const cancelScheduled = options.cancelScheduled ?? ((handle: unknown) => window.clearTimeout(handle as number));
  const hideAfterMs = options.hideAfterMs ?? 520;
  let handles: unknown[] = [];
  let running = false;

  function clear(): void {
    handles.forEach(cancelScheduled);
    handles = [];
  }

  return {
    isRunning: () => running,
    start(onDone: () => void): void {
      clear();
      running = true;
      (["3", "2", "1"] as const).forEach((label, index) => {
        handles.push(schedule(() => options.onLabel(label), index * options.stepMs));
      });
      handles.push(schedule(() => {
        running = false;
        options.onLabel("GO!");
        onDone();
        handles.push(schedule(options.onHide, hideAfterMs));
      }, 3 * options.stepMs));
    },
    cancel(): void {
      clear();
      running = false;
      options.onHide();
    },
  };
}
