/**
 * The handoff state machine (spec §8) and stream validation (PW401 to PW404).
 */

import { issue, type Issue } from './codes.js';
import { isHandoffState, isObject } from './rules.js';
import type { HandoffState } from './types.js';

/** Sentinel for "no state yet". */
export const START = '⊥' as const;
export type MachineState = HandoffState | typeof START;

/**
 * The transition table of spec §8.2. Self-loops are handled separately.
 * `START` lists the permitted first states of a *complete* log; a partial
 * stream (the default) may begin in any state, because a system first hears
 * of a handoff wherever it joins it.
 */
export const TRANSITIONS: Readonly<Record<MachineState, readonly HandoffState[]>> = {
  [START]: ['awaiting_parent', 'routing', 'offered', 'care_team', 'withdrawn'],
  awaiting_parent: ['routing', 'offered', 'withdrawn'],
  routing: ['offered', 'care_team', 'withdrawn'],
  offered: ['accepted', 'routing', 'offered', 'care_team', 'withdrawn'],
  accepted: ['contacted', 'routing', 'closed', 'withdrawn'],
  contacted: ['closed', 'withdrawn'],
  care_team: ['routing', 'offered', 'closed', 'withdrawn'],
  closed: ['withdrawn'],
  withdrawn: [],
};

export interface StreamOptions {
  /** The stream is a complete log from the handoff's creation (default `false`). */
  complete?: boolean;
}

/** Whether moving from `from` to `to` is permitted. */
export function canTransition(from: MachineState, to: HandoffState, opts: StreamOptions = {}): boolean {
  if (from === START && !opts.complete) return true;
  if (from === to) return true;
  return TRANSITIONS[from].includes(to);
}

/** Canonical JSON with sorted keys, for comparing redeliveries. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

interface Entry {
  index: number;
  event: Record<string, unknown>;
  time: number;
}

export interface Trace {
  handoffId: string;
  /** The sequence of states reached, starting from START. */
  states: MachineState[];
}

/**
 * Check the stream-level invariants over a list of events, in the order given.
 * Per-event invariants are not checked here; see `validateEventStream`.
 */
export function streamRules(
  events: readonly unknown[],
  opts: StreamOptions = {},
  path = '',
): { issues: Issue[]; traces: Trace[] } {
  const out: Issue[] = [];
  const byIdentity = new Map<string, { index: number; canon: string }>();
  const byHandoff = new Map<string, Entry[]>();

  events.forEach((event, index) => {
    if (!isObject(event)) return;
    const identity = `${String(event['source'])}\u0000${String(event['id'])}`;
    const canon = canonical(event);
    const prior = byIdentity.get(identity);
    if (prior) {
      if (prior.canon !== canon) {
        out.push(issue('PW403', `${path}/${index}`, `Same source and id as event ${prior.index} but different content`));
      }
      return; // a redelivery is processed at most once
    }
    byIdentity.set(identity, { index, canon });

    const data = isObject(event['data']) ? event['data'] : {};
    const handoffId = data['handoffId'];
    if (typeof handoffId !== 'string') return;
    const t = Date.parse(String(event['time']));
    const list = byHandoff.get(handoffId) ?? [];
    list.push({ index, event, time: Number.isNaN(t) ? Number.POSITIVE_INFINITY : t });
    byHandoff.set(handoffId, list);
  });

  const traces: Trace[] = [];
  for (const [handoffId, entries] of byHandoff) {
    for (let i = 1; i < entries.length; i++) {
      const prev = entries[i - 1];
      const cur = entries[i];
      if (prev && cur && cur.time < prev.time) {
        out.push(issue('PW404', `${path}/${cur.index}`, `Event is earlier than event ${prev.index} for handoff ${handoffId}; processed in time order`));
      }
    }
    // Stable sort by time: ties keep supplied order.
    const ordered = entries.map((e, k) => ({ e, k })).sort((a, b) => a.e.time - b.e.time || a.k - b.k).map((x) => x.e);

    let state: MachineState = START;
    const states: MachineState[] = [START];
    let deletedAt: number | undefined;
    for (const { index, event } of ordered) {
      if (deletedAt !== undefined) {
        out.push(issue('PW402', `${path}/${index}`, `Event follows person.deleted (event ${deletedAt}) for handoff ${handoffId}`));
        continue;
      }
      const data = isObject(event['data']) ? event['data'] : {};
      const next = data['state'];
      if (isHandoffState(next)) {
        if (!canTransition(state, next, opts)) {
          out.push(issue('PW401', `${path}/${index}/data/state`, `Transition ${state === START ? '(start)' : state} → ${next} is not permitted`));
        }
        state = next;
        states.push(state);
      }
      if (event['type'] === 'person.deleted') deletedAt = index;
    }
    traces.push({ handoffId, states });
  }
  return { issues: out, traces };
}
