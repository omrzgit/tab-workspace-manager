import test from 'node:test';
import assert from 'node:assert/strict';
import { StateMachine, UiState } from '../src/popup/stateMachine.js';

test('StateMachine initializes in IDLE state and allows valid transitions', () => {
  const fsm = new StateMachine();
  assert.equal(fsm.state, UiState.IDLE);

  fsm.transition(UiState.ACTIVE_WINDOWS);
  assert.equal(fsm.state, UiState.ACTIVE_WINDOWS);

  fsm.transition(UiState.SELECTION_DIRTY);
  assert.equal(fsm.state, UiState.SELECTION_DIRTY);

  fsm.transition(UiState.MUTATING);
  assert.equal(fsm.state, UiState.MUTATING);

  fsm.transition(UiState.SUCCESS);
  assert.equal(fsm.state, UiState.SUCCESS);

  fsm.transition(UiState.IDLE);
  assert.equal(fsm.state, UiState.IDLE);
});

test('StateMachine prevents illegal transitions', () => {
  const fsm = new StateMachine();
  assert.equal(fsm.can(UiState.SUCCESS), false);
  assert.throws(() => fsm.transition(UiState.SUCCESS), /Illegal UI state transition/);
});

test('StateMachine subscriptions receive notifications', () => {
  const fsm = new StateMachine();
  const states = [];
  const unsub = fsm.subscribe((s) => states.push(s));

  fsm.transition(UiState.SETTINGS);
  fsm.transition(UiState.IDLE);
  assert.deepEqual(states, [UiState.SETTINGS, UiState.IDLE]);

  unsub();
  fsm.transition(UiState.ACTIVE_WINDOWS);
  assert.equal(states.length, 2);
});
