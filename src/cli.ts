#!/usr/bin/env node
/**
 * pathway-validate: validate Pathway messages from the command line.
 *
 *   pathway-validate [--kind bundle|organisation|response|event|stream] [--profile strict|base]
 *                    [--now ISO-8601] [--max-consent-age-days N] [--complete] [--json] FILE...
 *
 * Exit status: 0 if every file is valid, 1 if any has errors, 2 on usage error.
 */

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import {
  validateBundle,
  validateEvent,
  validateEventStream,
  validateOrganisation,
  validateResponse,
  type Result,
  type ResponseOptions,
  type StreamOptions,
} from './index.js';

const KINDS = ['bundle', 'organisation', 'response', 'event', 'stream'] as const;
type Kind = (typeof KINDS)[number];

function run(kind: Kind, value: unknown, opts: ResponseOptions & StreamOptions): Result {
  switch (kind) {
    case 'organisation':
      return validateOrganisation(value, opts);
    case 'response':
      return validateResponse(value, opts);
    case 'event':
      return validateEvent(value, opts);
    case 'stream':
      return validateEventStream(Array.isArray(value) ? value : [value], opts);
    case 'bundle':
      return validateBundle(value, opts);
  }
}

function main(argv: string[]): number {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        kind: { type: 'string', default: 'bundle' },
        profile: { type: 'string', default: 'strict' },
        now: { type: 'string' },
        'max-consent-age-days': { type: 'string' },
        complete: { type: 'boolean', default: false },
        json: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    });
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n`);
    return 2;
  }
  const { values, positionals } = parsed;
  if (values.help || positionals.length === 0) {
    process.stdout.write('usage: pathway-validate [--kind bundle|organisation|response|event|stream] [--profile strict|base] [--now ISO] [--max-consent-age-days N] [--complete] [--json] FILE...\n');
    return values.help ? 0 : 2;
  }
  if (!(KINDS as readonly string[]).includes(values.kind) || !['strict', 'base'].includes(values.profile)) {
    process.stderr.write('invalid --kind or --profile\n');
    return 2;
  }
  const opts: ResponseOptions & StreamOptions = { profile: values.profile as 'strict' | 'base', complete: values.complete };
  if (values.now) opts.now = new Date(values.now);
  if (values['max-consent-age-days']) opts.maxConsentAgeDays = Number(values['max-consent-age-days']);

  let failed = false;
  const report: Record<string, Result> = {};
  for (const file of positionals) {
    let value: unknown;
    try {
      value = JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
      process.stderr.write(`${file}: cannot read JSON: ${(e as Error).message}\n`);
      failed = true;
      continue;
    }
    const r = run(values.kind as Kind, value, opts);
    report[file] = r;
    failed ||= !r.valid;
    if (!values.json) {
      process.stdout.write(`${file}: ${r.valid ? 'valid' : 'INVALID'}\n`);
      for (const i of r.issues) process.stdout.write(`  ${i.severity.padEnd(7)} ${i.code} ${i.path || '/'}  ${i.message}\n`);
    }
  }
  if (values.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return failed ? 1 : 0;
}

process.exitCode = main(process.argv.slice(2));
