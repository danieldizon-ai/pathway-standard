/**
 * Runs every conformance vector through the reference validator, and checks
 * that the strict-profile JSON Schema agrees with the validator on each one.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  CODES,
  validateBundle,
  validateEvent,
  validateEventStream,
  validateHandoff,
  validateOrganisation,
  validateResponse,
  validateStrictSchema,
  type Code,
  type MessageKind,
  type Result,
} from '../src/index.js';

interface Vector {
  file: string;
  kind: 'bundle' | 'organisation' | 'response' | 'event' | 'handoff' | 'stream';
  description: string;
  options?: { profile?: 'base' | 'strict'; sending?: boolean; now?: string; maxConsentAgeDays?: number; complete?: boolean };
  expect: { valid: boolean; codes: Code[] };
}

const ROOT = new URL('../../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('conformance/manifest.json', ROOT), 'utf8')) as { vectors: Vector[] };
const load = (file: string): unknown => JSON.parse(readFileSync(new URL(`conformance/${file}`, ROOT), 'utf8'));

function run(v: Vector, value: unknown): Result {
  const o = v.options ?? {};
  const opts = {
    ...(o.profile ? { profile: o.profile } : {}),
    ...(o.sending !== undefined ? { sending: o.sending } : {}),
    ...(o.now ? { now: new Date(o.now) } : {}),
    ...(o.maxConsentAgeDays !== undefined ? { maxConsentAgeDays: o.maxConsentAgeDays } : {}),
    ...(o.complete !== undefined ? { complete: o.complete } : {}),
  };
  switch (v.kind) {
    case 'bundle':
      return validateBundle(value, opts);
    case 'organisation':
      return validateOrganisation(value, opts);
    case 'response':
      return validateResponse(value, opts);
    case 'event':
      return validateEvent(value, opts);
    case 'handoff':
      return validateHandoff(value as { response: unknown; receiver: unknown }, opts);
    case 'stream':
      return validateEventStream(value as unknown[], opts);
  }
}

describe('conformance vectors', () => {
  assert.ok(manifest.vectors.length >= 50, 'manifest should list the full vector set');
  for (const v of manifest.vectors) {
    it(`${v.file}: ${v.description}`, () => {
      const r = run(v, load(v.file));
      const codes = [...new Set(r.issues.map((i) => i.code))].sort();
      assert.deepEqual(codes, v.expect.codes, JSON.stringify(r.issues, null, 2));
      assert.equal(r.valid, v.expect.valid);
      for (const i of r.issues) {
        assert.equal(i.severity, CODES[i.code].severity);
        assert.ok(i.path === '' || i.path.startsWith('/'), `path ${i.path} is a JSON Pointer`);
      }
    });
  }

  it('covers every issue code', () => {
    const covered = new Set(manifest.vectors.flatMap((v) => v.expect.codes));
    const missing = (Object.keys(CODES) as Code[]).filter((c) => !covered.has(c));
    assert.deepEqual(missing, []);
  });
});

const SCHEMA_KIND: Partial<Record<Vector['kind'], MessageKind>> = {
  organisation: 'Organisation',
  response: 'Response',
  event: 'HandoffEvent',
};

describe('strict JSON Schema agrees with the validator', () => {
  for (const v of manifest.vectors) {
    const kind = SCHEMA_KIND[v.kind];
    if (!kind || v.options?.profile === 'base') continue;
    it(v.file, () => {
      const value = load(v.file);
      const schemaErrors = validateStrictSchema(kind, value);
      const expressibleErrors = v.expect.codes.filter((c) => CODES[c].severity === 'error' && CODES[c].schemaExpressible);
      // A response validated as stored (sending: false) is outside the schema's sending context.
      if (v.options?.sending === false) return;
      assert.equal(
        schemaErrors.length === 0,
        expressibleErrors.length === 0,
        `validator codes ${JSON.stringify(v.expect.codes)}; schema errors ${JSON.stringify(schemaErrors.map((e) => `${e.instancePath} ${e.message}`))}`,
      );
    });
  }
});
