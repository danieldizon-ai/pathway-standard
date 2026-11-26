/**
 * Structural validation against the upstream v0.2 JSON Schema (PW001), and
 * access to the strict-profile schema.
 */

import { readFileSync } from 'node:fs';
import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';

import { issue, type Issue } from './codes.js';

// ajv-formats is CommonJS; under NodeNext its default export is the module object.
const addFormats = addFormatsModule as unknown as (ajv: Ajv2020) => Ajv2020;

const ROOT = new URL('../../', import.meta.url);

function loadJson(relative: string): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL(relative, ROOT), 'utf8')) as Record<string, unknown>;
}

export const UPSTREAM_SCHEMA = loadJson('spec/upstream/always-pathway-v0.2.schema.json');
export const STRICT_SCHEMA = loadJson('schema/pathway-v0.2-strict.schema.json');

export const UPSTREAM_ID = UPSTREAM_SCHEMA['$id'] as string;
export const STRICT_ID = STRICT_SCHEMA['$id'] as string;

export type MessageKind = 'Organisation' | 'Response' | 'Consent' | 'HandoffEvent';

function makeAjv(): Ajv2020 {
  // strict: false because the upstream schema uses `description` inside items
  // and `default` alongside `type`, both valid but flagged by Ajv's strict mode.
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(UPSTREAM_SCHEMA);
  return ajv;
}

const ajv = makeAjv();
const upstreamValidators = new Map<MessageKind, ValidateFunction>();
const strictValidators = new Map<MessageKind, ValidateFunction>();

function compiled(cache: Map<MessageKind, ValidateFunction>, id: string, kind: MessageKind): ValidateFunction {
  let v = cache.get(kind);
  if (!v) {
    const fn = ajv.getSchema(`${id}#/$defs/${kind}`);
    if (!fn) throw new Error(`schema definition ${kind} not found in ${id}`);
    v = fn;
    cache.set(kind, v);
  }
  return v;
}

function describe(e: ErrorObject): string {
  const where = e.instancePath || '/';
  return `${where} ${e.message ?? 'is invalid'}${e.params && Object.keys(e.params).length ? ` (${JSON.stringify(e.params)})` : ''}`;
}

/** Validate against the upstream definition of `kind`; each schema error becomes a PW001 issue. */
export function validateUpstream(kind: MessageKind, value: unknown): Issue[] {
  const v = compiled(upstreamValidators, UPSTREAM_ID, kind);
  if (v(value)) return [];
  return (v.errors ?? []).map((e) => issue('PW001', e.instancePath, describe(e)));
}

/** Validate against the strict-profile schema. Returns raw Ajv errors. */
export function validateStrictSchema(kind: MessageKind, value: unknown): ErrorObject[] {
  if (!ajv.getSchema(STRICT_ID)) ajv.addSchema(STRICT_SCHEMA);
  const v = compiled(strictValidators, STRICT_ID, kind);
  return v(value) ? [] : [...(v.errors ?? [])];
}
