/**
 * Invariants that the upstream schema does not express (spec §7).
 *
 * Every rule is a pure function of its input and options. Rules run even when
 * PW001 has already reported structural errors, guarding every access, so a
 * single call reports as much as can be determined.
 */

import { issue, type Issue } from './codes.js';
import { UPSTREAM_SCHEMA } from './schema.js';
import {
  HANDOFF_STATES,
  type AgeBand,
  type EventType,
  type HandoffState,
} from './types.js';

export type Profile = 'base' | 'strict';

export interface ResponseOptions {
  /** `strict` (default) applies PW002, closing every object. */
  profile?: Profile;
  /**
   * The response is being sent or received as a handoff (default `true`).
   * PW103 and PW105 apply only then; a stored, withdrawn response is not itself invalid.
   */
  sending?: boolean;
  /** Current time, enabling PW108 (and PW109 with `maxConsentAgeDays`). */
  now?: Date;
  /** Permitted clock skew for PW108, in seconds. Default 300. */
  clockSkewSeconds?: number;
  /** Receiver policy for PW109, e.g. 365. Off when absent. */
  maxConsentAgeDays?: number;
}

type Json = Record<string, unknown>;

export const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Escape one JSON Pointer reference token (RFC 6901 §3). */
export const token = (s: string | number): string => String(s).replace(/~/g, '~0').replace(/\//g, '~1');

const BANDS_UNDER_15: readonly AgeBand[] = ['under13', '13-14'];
const BAND_ORDER: readonly AgeBand[] = ['under13', '13-14', '15-17', '18+'];

function lowerBand(a: unknown, b: unknown): AgeBand | undefined {
  const ia = BAND_ORDER.indexOf(a as AgeBand);
  const ib = BAND_ORDER.indexOf(b as AgeBand);
  const known = [ia, ib].filter((i) => i >= 0);
  return known.length ? BAND_ORDER[Math.min(...known)] : undefined;
}

function time(v: unknown): number | undefined {
  if (typeof v !== 'string') return undefined;
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : t;
}

// ---------------------------------------------------------------- PW002: closed objects

/** CloudEvents 1.0 optional context attributes, permitted on events in the strict profile. */
export const CLOUDEVENTS_OPTIONAL = ['datacontenttype', 'dataschema', 'subject'] as const;

const DEFS = UPSTREAM_SCHEMA['$defs'] as Record<string, Json>;

function resolve(node: Json): Json {
  const ref = node['$ref'];
  if (typeof ref === 'string' && ref.startsWith('#/$defs/')) {
    const target = DEFS[ref.slice('#/$defs/'.length)];
    if (target) return resolve(target);
  }
  return node;
}

/**
 * Report members not declared by the upstream schema, recursively.
 * Derived from the upstream schema's `properties`, independently of the
 * strict-profile schema, so the two can be checked against each other.
 */
export function unknownMembers(schemaNode: Json, value: unknown, path: string, extra: readonly string[] = []): Issue[] {
  const node = resolve(schemaNode);
  const out: Issue[] = [];
  if (isObject(value) && isObject(node['properties'])) {
    const props = node['properties'] as Record<string, Json>;
    for (const [k, v] of Object.entries(value)) {
      const sub = props[k];
      if (!sub) {
        if (!extra.includes(k)) out.push(issue('PW002', `${path}/${token(k)}`, `Unknown member "${k}"`));
        continue;
      }
      out.push(...unknownMembers(sub, v, `${path}/${token(k)}`));
    }
  } else if (Array.isArray(value) && isObject(node['items'])) {
    value.forEach((v, i) => out.push(...unknownMembers(node['items'] as Json, v, `${path}/${i}`)));
  }
  return out;
}

export function closedWorld(kind: 'Organisation' | 'Response' | 'HandoffEvent', value: unknown, path = ''): Issue[] {
  const def = DEFS[kind];
  if (!def) throw new Error(`no upstream definition for ${kind}`);
  return unknownMembers(def, value, path, kind === 'HandoffEvent' ? CLOUDEVENTS_OPTIONAL : []);
}

// ---------------------------------------------------------------- PW1xx: response and consent

export function responseRules(value: unknown, opts: ResponseOptions = {}, path = ''): Issue[] {
  if (!isObject(value)) return [];
  const out: Issue[] = [];
  const sending = opts.sending ?? true;
  const consent = isObject(value['consent']) ? value['consent'] : undefined;
  const cp = `${path}/consent`;

  if (consent) {
    if (consent['ageBand'] !== undefined && consent['ageBand'] !== value['ageBand']) {
      out.push(issue('PW101', `${cp}/ageBand`, `Consent age band "${String(consent['ageBand'])}" differs from response age band "${String(value['ageBand'])}"`));
    }

    // CY-3: where bands disagree, the lower applies.
    const band = lowerBand(value['ageBand'], consent['ageBand']);
    if (band && BANDS_UNDER_15.includes(band) && consent['party'] !== 'parent' && consent['parentConfirmedAt'] === undefined) {
      out.push(issue('PW102', `${cp}/party`, `Age band ${band} needs consent by a parent (party "parent") or parentConfirmedAt`));
    }

    if (sending && consent['withdrawnAt'] !== undefined) {
      out.push(issue('PW103', `${cp}/withdrawnAt`, 'Consent was withdrawn; the response must not be handed off'));
    }

    const collected = time(consent['collectedAt']);
    for (const field of ['parentConfirmedAt', 'withdrawnAt'] as const) {
      const t = time(consent[field]);
      if (collected !== undefined && t !== undefined && t < collected) {
        out.push(issue('PW104', `${cp}/${field}`, `${field} is earlier than collectedAt`));
      }
    }

    const purposes = consent['purposes'];
    if (sending && Array.isArray(purposes) && !purposes.includes('connect.church')) {
      out.push(issue('PW105', `${cp}/purposes`, 'Purpose "connect.church" is required for a handoff'));
    }

    for (const field of ['purposes', 'recipients'] as const) {
      const arr = consent[field];
      if (!Array.isArray(arr)) continue;
      const seen = new Set<unknown>();
      arr.forEach((v, i) => {
        if (seen.has(v)) out.push(issue('PW107', `${cp}/${field}/${i}`, `Duplicate ${field} item ${JSON.stringify(v)}`));
        seen.add(v);
      });
    }

    if (opts.now && collected !== undefined) {
      const skew = (opts.clockSkewSeconds ?? 300) * 1000;
      if (collected > opts.now.getTime() + skew) {
        out.push(issue('PW108', `${cp}/collectedAt`, 'collectedAt is in the future'));
      }
      if (opts.maxConsentAgeDays !== undefined) {
        const ageDays = (opts.now.getTime() - collected) / 86_400_000;
        if (ageDays > opts.maxConsentAgeDays) {
          out.push(issue('PW109', `${cp}/collectedAt`, `Consent is ${Math.floor(ageDays)} days old; the maximum is ${opts.maxConsentAgeDays}`));
        }
      }
    }
  }

  const contact = value['contact'];
  if (isObject(contact) && Object.keys(contact).length !== 1) {
    out.push(issue('PW106', `${path}/contact`, `Contact has ${Object.keys(contact).length} methods; exactly one is required`));
  }
  return out;
}

// ---------------------------------------------------------------- PW2xx: response with its receiver

export function receiverRules(response: unknown, receiver: unknown, responsePath = '/response', receiverPath = '/receiver'): Issue[] {
  if (!isObject(response) || !isObject(receiver)) return [];
  const out: Issue[] = [];
  const consent = isObject(response['consent']) ? response['consent'] : undefined;
  const id = receiver['id'];
  if (consent && Array.isArray(consent['recipients'])) {
    if (!consent['recipients'].includes(id) && consent['allowNextNearby'] !== true) {
      out.push(issue('PW201', `${responsePath}/consent/recipients`, `Receiver ${String(id)} is not a named recipient and allowNextNearby is not true`));
    }
  }
  const offers = receiver['offers'];
  if (Array.isArray(offers) && typeof response['step'] === 'string' && !offers.includes(response['step'])) {
    out.push(issue('PW202', `${responsePath}/step`, `Receiver does not list step "${response['step']}" in offers`));
  }
  const band = lowerBand(response['ageBand'], consent?.['ageBand']);
  if (band && band !== '18+' && receiver['trustLevel'] !== 'verified_youth') {
    out.push(issue('PW203', `${receiverPath}/trustLevel`, `Person is in age band ${band}; receiver trust level is "${String(receiver['trustLevel'])}"`));
  }
  return out;
}

// ---------------------------------------------------------------- PW3xx: single event

export const HANDOFF_SCOPED: ReadonlySet<EventType> = new Set<EventType>([
  'handoff.offered',
  'handoff.accepted',
  'handoff.passed',
  'handoff.expired',
  'handoff.rerouted',
  'handoff.status_changed',
  'consent.withdrawn',
  'person.deleted',
]);

export const ORGANISATION_SCOPED: ReadonlySet<EventType> = new Set<EventType>(['organisation.verified', 'organisation.suspended']);

/** Spec §6.1: the states each event type may carry. An empty list means `state` must be absent. */
export const PERMITTED_STATES: Readonly<Record<EventType, readonly HandoffState[]>> = {
  'handoff.offered': ['offered'],
  'handoff.accepted': ['accepted'],
  'handoff.passed': ['routing'],
  'handoff.expired': ['routing', 'withdrawn'],
  'handoff.rerouted': ['routing'],
  'handoff.status_changed': ['accepted', 'contacted', 'care_team', 'closed'],
  'consent.withdrawn': ['withdrawn'],
  'person.deleted': ['withdrawn'],
  'organisation.verified': [],
  'organisation.suspended': [],
};

const EMAIL = /[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[a-z]{2,}/i;
const E164 = /\+[1-9]\d{6,14}(?!\d)/;

function* strings(value: unknown, path: string): Generator<[string, string]> {
  if (typeof value === 'string') yield [path, value];
  else if (Array.isArray(value)) for (const [i, v] of value.entries()) yield* strings(v, `${path}/${i}`);
  else if (isObject(value)) for (const [k, v] of Object.entries(value)) yield* strings(v, `${path}/${token(k)}`);
}

export function eventRules(value: unknown, path = ''): Issue[] {
  if (!isObject(value)) return [];
  const out: Issue[] = [];

  for (const [p, s] of strings(value, path)) {
    if (EMAIL.test(s) || E164.test(s)) out.push(issue('PW301', p, 'Value looks like an email address or phone number; events must carry status only'));
  }

  const type = value['type'] as EventType;
  const data = isObject(value['data']) ? value['data'] : {};
  const dp = `${path}/data`;

  if (HANDOFF_SCOPED.has(type) && data['handoffId'] === undefined) {
    out.push(issue('PW302', `${dp}/handoffId`, `${type} must identify its handoff`));
  }

  const permitted = PERMITTED_STATES[type] as readonly HandoffState[] | undefined;
  if (permitted && data['state'] !== undefined && !permitted.includes(data['state'] as HandoffState)) {
    out.push(
      issue('PW303', `${dp}/state`, permitted.length
        ? `${type} may carry state ${permitted.join(' or ')}, not "${String(data['state'])}"`
        : `${type} must not carry a handoff state`),
    );
  }

  if ((type === 'handoff.passed') !== (data['passReason'] !== undefined)) {
    out.push(issue('PW304', `${dp}/passReason`, type === 'handoff.passed' ? 'handoff.passed requires passReason' : `passReason is only valid on handoff.passed, not ${type}`));
  }

  if ((type === 'handoff.status_changed') !== (data['status'] !== undefined)) {
    out.push(issue('PW305', `${dp}/status`, type === 'handoff.status_changed' ? 'handoff.status_changed requires status' : `status is only valid on handoff.status_changed, not ${type}`));
  }

  if (ORGANISATION_SCOPED.has(type) && (data['orgId'] === undefined || data['handoffId'] !== undefined)) {
    out.push(issue('PW306', dp, `${type} must carry orgId and must not carry handoffId`));
  }
  return out;
}

export const isHandoffState = (s: unknown): s is HandoffState => (HANDOFF_STATES as readonly unknown[]).includes(s);
