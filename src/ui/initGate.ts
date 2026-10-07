/** Guards game (re)initialization: one at a time, and no snapshot of an old game is accepted while no game is active. */
export function createInitGate() {
  let initializing = false;
  let acceptId: string | null = null;
  let epoch = 0;
  return {
    begin(): number | null {
      if (initializing) return null;
      initializing = true;
      acceptId = null;
      epoch += 1;
      return epoch;
    },
    adopt(token: number, id: string): boolean {
      if (token !== epoch) return false;
      initializing = false;
      acceptId = id;
      return true;
    },
    fail(token: number): void {
      if (token === epoch) initializing = false;
    },
    isCurrent(token: number): boolean {
      return token === epoch;
    },
    allows(gameActive: boolean, id: string): boolean {
      if (gameActive) return true;
      if (initializing) return false;
      return acceptId !== null && id === acceptId;
    },
  };
}
