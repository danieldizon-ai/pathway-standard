import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  HANDOFF_STATES,
  PERMITTED_STATES,
  START,
  TRANSITIONS,
  canTransition,
  validateBundle,
  validateEvent,
  validateEventStream,
  validateResponse,
  type HandoffState,
} from '../src/index.js';
import { token, unknownMembers } from '../src/rules.js';
import { canonical } from '../src/state-machine.js';

describe('validator robustness', () => {
  for (const bad of [null, 42, 'text', [], {}, { consent: 'nope' }, { data: [] }]) {
    it(`never throws on ${JSON.stringify(bad)}`, () => {
      for (const f of [validateResponse, validateEvent]) {
        const r = f(bad);
        assert.equal(r.valid, false);
        assert.ok(r.issues.length > 0);
      }
      assert.doesNotThrow(() => validateBundle(bad));
      assert.equal(validateEventStream([bad]).valid, false);
    });
  }
});

describe('JSON Pointer tokens', () => {
  it('escapes ~ and / per RFC 6901', () => {
    assert.equal(token('a/b~c'), 'a~1b~0c');
    const issues = unknownMembers({ properties: {} }, { 'x/y': 1 }, '');
    assert.equal(issues[0]?.path, '/x~1y');
  });
});

describe('state machine', () => {
  it('has no transitions out of withdrawn except staying', () => {
    for (const s of HANDOFF_STATES) {
      assert.equal(canTransition('withdrawn', s, { complete: true }), s === 'withdrawn');
    }
  });

  it('lets every non-terminal state withdraw', () => {
    for (const s of HANDOFF_STATES) assert.ok(canTransition(s, 'withdrawn'), s);
  });

  it('only references known states', () => {
    for (const [from, tos] of Object.entries(TRANSITIONS)) {
      assert.ok(from === START || (HANDOFF_STATES as readonly string[]).includes(from));
      for (const to of tos) assert.ok((HANDOFF_STATES as readonly string[]).includes(to));
    }
  });

  it('can reach every state from a complete-log start', () => {
    const seen = new Set<string>([START]);
    const queue: (HandoffState | typeof START)[] = [START];
    while (queue.length) {
      const s = queue.shift()!;
      for (const t of TRANSITIONS[s]) if (!seen.has(t)) (seen.add(t), queue.push(t));
    }
    for (const s of HANDOFF_STATES) assert.ok(seen.has(s), s);
  });

  it('every state an event may carry is a known state', () => {
    for (const states of Object.values(PERMITTED_STATES)) {
      for (const s of states) assert.ok((HANDOFF_STATES as readonly string[]).includes(s));
    }
  });

  it('reports the state trace', () => {
    const ev = (n: number, type: string, state: string, extra: object = {}) => ({
      specversion: '1.0', type, source: 'https://a.example', id: `e${n}`, time: `2026-01-01T0${n}:00:00Z`,
      data: { handoffId: 'c7a1e2b3-4d5f-4a6b-9c8d-7e6f5a4b3c21', state, ...extra },
    });
    const r = validateEventStream([ev(1, 'handoff.offered', 'offered'), ev(2, 'handoff.accepted', 'accepted')]);
    assert.equal(r.valid, true);
    assert.deepEqual(r.traces[0]?.states, [START, 'offered', 'accepted']);
  });
});

describe('canonical JSON', () => {
  it('ignores key order', () => {
    assert.equal(canonical({ b: 1, a: [{ d: 2, c: 3 }] }), canonical({ a: [{ c: 3, d: 2 }], b: 1 }));
    assert.notEqual(canonical({ a: 1 }), canonical({ a: '1' }));
  });
});
