/**
 * UI State Machine (spec Â§2, transition table).
 * Illegal transitions throw â€” callers surface ERROR states explicitly.
 */
export const UiState = Object.freeze({
  IDLE: 'IDLE',
  LOADING: 'LOADING',
  ACTIVE_WINDOWS: 'ACTIVE_WINDOWS',
  SELECTION_DIRTY: 'SELECTION_DIRTY',
  SETTINGS: 'SETTINGS',
  MUTATING: 'MUTATING',
  ERROR: 'ERROR',
  SUCCESS: 'SUCCESS',
});

/** Allowed transitions across UI states. */
const TRANSITIONS = Object.freeze({
  [UiState.IDLE]: new Set([
    UiState.LOADING, UiState.ACTIVE_WINDOWS, UiState.SETTINGS, UiState.MUTATING,
  ]),
  [UiState.ACTIVE_WINDOWS]: new Set([UiState.SELECTION_DIRTY, UiState.IDLE, UiState.MUTATING]),
  [UiState.SELECTION_DIRTY]: new Set([UiState.ACTIVE_WINDOWS, UiState.MUTATING, UiState.IDLE]),
  [UiState.SETTINGS]: new Set([UiState.IDLE, UiState.MUTATING]),
  [UiState.MUTATING]: new Set([UiState.SUCCESS, UiState.ERROR]),
  [UiState.ERROR]: new Set([UiState.SELECTION_DIRTY, UiState.IDLE, UiState.SETTINGS, UiState.ACTIVE_WINDOWS]),
  [UiState.SUCCESS]: new Set([UiState.IDLE, UiState.SETTINGS]),
  [UiState.LOADING]: new Set([UiState.IDLE, UiState.ERROR]),
});

export class StateMachine {
  /** @type {UiState[keyof typeof UiState]} */
  #state = UiState.IDLE;
  /** @type {Set<(state: string) => void>} */
  #listeners = new Set();

  get state() {
    return this.#state;
  }

  /** @param {string} target @returns {boolean} */
  can(target) {
    return TRANSITIONS[this.#state]?.has(target) ?? false;
  }

  /**
   * @param {string} target
   * @returns {{ from: string, to: string }}
   */
  transition(target) {
    if (!this.can(target)) {
      throw new Error(`Illegal UI state transition: ${this.#state} â†’ ${target}`);
    }
    const from = this.#state;
    this.#state = target;
    for (const listener of this.#listeners) listener(target);
    return { from, to: target };
  }

  /** @param {(state: string) => void} listener @returns {() => void} */
  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}