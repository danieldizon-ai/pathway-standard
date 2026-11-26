/**
 * Reference validator for the Always Pathway handoff format v0.2.
 *
 * Every function takes `unknown`, never throws on bad input, and returns a
 * `Result` listing issues by stable code (spec §7).
 */

import { result, type Issue, type Result } from './codes.js';
import { closedWorld, eventRules, isObject, receiverRules, responseRules, type Profile, type ResponseOptions } from './rules.js';
import { validateUpstream } from './schema.js';
import { streamRules, type StreamOptions, type Trace } from './state-machine.js';

export { CODES, type Code, type CodeInfo, type Issue, type Result, type Severity } from './codes.js';
export { PERMITTED_STATES, type Profile, type ResponseOptions } from './rules.js';
export { STRICT_SCHEMA, UPSTREAM_SCHEMA, validateStrictSchema, type MessageKind } from './schema.js';
export { START, TRANSITIONS, canTransition, type MachineState, type StreamOptions, type Trace } from './state-machine.js';
export * from './types.js';

export interface ProfileOptions {
  /** `strict` (default) rejects unknown members (PW002). */
  profile?: Profile;
}

function prefixed(issues: Issue[], prefix: string): Issue[] {
  return prefix ? issues.map((i) => ({ ...i, path: `${prefix}${i.path}` })) : issues;
}

function organisationIssues(value: unknown, opts: ProfileOptions): Issue[] {
  const issues = validateUpstream('Organisation', value);
  if ((opts.profile ?? 'strict') === 'strict') issues.push(...closedWorld('Organisation', value));
  return issues;
}

function responseIssues(value: unknown, opts: ResponseOptions): Issue[] {
  const issues = validateUpstream('Response', value);
  if ((opts.profile ?? 'strict') === 'strict') issues.push(...closedWorld('Response', value));
  issues.push(...responseRules(value, opts));
  return issues;
}

function eventIssues(value: unknown, opts: ProfileOptions): Issue[] {
  const issues = validateUpstream('HandoffEvent', value);
  if ((opts.profile ?? 'strict') === 'strict') issues.push(...closedWorld('HandoffEvent', value));
  issues.push(...eventRules(value));
  return issues;
}

/** Validate a directory entry. */
export function validateOrganisation(value: unknown, opts: ProfileOptions = {}): Result {
  return result(organisationIssues(value, opts));
}

/** Validate a response and its consent, as sent in a handoff unless `opts.sending` is false. */
export function validateResponse(value: unknown, opts: ResponseOptions = {}): Result {
  return result(responseIssues(value, opts));
}

/** Validate a single status event. */
export function validateEvent(value: unknown, opts: ProfileOptions = {}): Result {
  return result(eventIssues(value, opts));
}

/** Validate a response being handed to a known receiver: PW1xx on the response, PW2xx on the pair. */
export function validateHandoff(value: { response: unknown; receiver: unknown }, opts: ResponseOptions = {}): Result {
  return result([
    ...prefixed(responseIssues(value.response, opts), '/response'),
    ...prefixed(organisationIssues(value.receiver, opts), '/receiver'),
    ...receiverRules(value.response, value.receiver),
  ]);
}

export interface StreamResult extends Result {
  readonly traces: readonly Trace[];
}

/** Validate a list of events: each event individually, then the stream invariants and state machine. */
export function validateEventStream(events: readonly unknown[], opts: ProfileOptions & StreamOptions = {}): StreamResult {
  const perEvent = events.flatMap((e, i) => prefixed(eventIssues(e, opts), `/${i}`));
  const { issues, traces } = streamRules(events, opts);
  return { ...result([...perEvent, ...issues]), traces };
}

/**
 * Validate a bundle in the layout of the upstream example file:
 * `{ organisation?, response?, event?, events? }`. When both an organisation and
 * a response are present, the organisation is treated as the receiver.
 */
export function validateBundle(value: unknown, opts: ResponseOptions = {}): Result {
  if (!isObject(value)) {
    return result([{ code: 'PW001', severity: 'error', path: '', message: 'Bundle must be a JSON object' }]);
  }
  const issues: Issue[] = [];
  const { organisation, response, event, events } = value;
  if (organisation !== undefined && response !== undefined) {
    issues.push(...prefixed(organisationIssues(organisation, opts), '/organisation'));
    issues.push(...prefixed(responseIssues(response, opts), '/response'));
    issues.push(...receiverRules(response, organisation, '/response', '/organisation'));
  } else if (organisation !== undefined) {
    issues.push(...prefixed(organisationIssues(organisation, opts), '/organisation'));
  } else if (response !== undefined) {
    issues.push(...prefixed(responseIssues(response, opts), '/response'));
  }
  if (event !== undefined) issues.push(...prefixed(eventIssues(event, opts), '/event'));
  if (Array.isArray(events)) issues.push(...prefixed([...validateEventStream(events, opts).issues], '/events'));
  return result(issues);
}
