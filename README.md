# pathway-standard

An implementer specification, a strict JSON Schema profile, a reference validator
and a conformance suite for the **Always Pathway** handoff format, version 0.2:
the open standard for passing a consenting person from one ministry to a church
or another ministry, with their consent travelling with them, whatever
software each side uses.

The upstream standard (Always Foundation, CC BY 4.0) is a JSON Schema plus a
short description. This repository makes it precise enough for independent
implementations to agree: it states every rule in RFC 2119 terms, adds the
invariants the schema cannot express, defines the lifecycle of a handoff as a
state machine, and checks all of it against 61 conformance vectors.

```
npm ci
npm test                                   # builds, then runs 117 tests
npx pathway-validate --kind bundle conformance/vectors/bundle-upstream-example.json
```

## Contents

| Path | What it is |
|---|---|
| [`spec/pathway-v0.2-spec.md`](spec/pathway-v0.2-spec.md) | The specification: data model, invariants PW001 to PW404, state machine, conformance classes, security and privacy considerations |
| [`spec/upstream/`](spec/upstream/) | The upstream v0.2 schema, unchanged |
| [`schema/pathway-v0.2-strict.schema.json`](schema/pathway-v0.2-strict.schema.json) | The strict profile as JSON Schema 2020-12, composing the upstream schema by reference |
| [`src/`](src/) | The reference validator (TypeScript, strict mode) and `pathway-validate` CLI |
| [`conformance/`](conformance/) | Language-neutral test vectors indexed by invariant code |
| [`docs/findings.md`](docs/findings.md) | Fourteen gaps found in v0.2 while specifying it, with proposals |
| [`docs/rationale.md`](docs/rationale.md) | Why the standard and this repository are designed as they are |

## The format in one picture

```
            Response + Consent (personal data)            once per handoff
 Sender ─────────────────────────────────────────▶ Receiver
        ◀─────────────────────────────────────────
            HandoffEvent (CloudEvents, status only)       many per handoff
```

Four message types: `Organisation` (directory entry), `Response` (what the
person shared), `Consent` (nested in the response) and `HandoffEvent` (a
status update with no personal data). Each step of a person's path is a
separate handoff with its own consent; nothing links them.

## Architecture

```
                         ┌──────────────────────────────┐
  unknown JSON ────────▶ │ schema.ts   upstream schema  │──▶ PW001
                         │             (Ajv, 2020-12)   │
                         ├──────────────────────────────┤
                         │ rules.ts    closed world     │──▶ PW002   (strict profile)
                         │             response/consent │──▶ PW101–PW109
                         │             receiver         │──▶ PW201–PW203
                         │             single event     │──▶ PW301–PW306
                         ├──────────────────────────────┤
                         │ state-machine.ts  streams    │──▶ PW401–PW404
                         └──────────────────────────────┘
                                        │
                                        ▼
                         { valid, issues: [{ code, severity, path, message }] }
```

- **`schema.ts`** loads the upstream schema and the strict schema into one Ajv
  instance and maps each schema error to PW001 with its JSON Pointer.
- **`rules.ts`** holds the invariants as pure functions over `unknown`. The
  closed-world check (PW002) walks the *upstream* schema's `properties`, so it
  is independent of the strict schema it is tested against.
- **`state-machine.ts`** defines the transition relation of spec §8 and
  validates event streams: deduplication by CloudEvents identity, ordering by
  time, transitions, and nothing after deletion.
- **`index.ts`** composes these into `validateOrganisation`,
  `validateResponse`, `validateEvent`, `validateHandoff`,
  `validateEventStream` and `validateBundle`.

## Usage

```ts
import { validateHandoff, validateEventStream } from 'pathway-standard';

const r = validateHandoff({ response, receiver }, { now: new Date(), maxConsentAgeDays: 365 });
if (!r.valid) {
  for (const i of r.issues) console.log(i.severity, i.code, i.path, i.message);
}
// error PW102 /response/consent/party Age band 13-14 needs consent by a parent ...

const s = validateEventStream(events, { complete: false });
s.traces; // [{ handoffId, states: ['⊥', 'offered', 'accepted', 'contacted'] }]
```

The strict schema is exported as `pathway-standard/schema/strict` for use with
any JSON Schema 2020-12 validator; register the upstream schema
(`pathway-standard/schema/upstream`) alongside it.

## Invariants at a glance

| Code | Rule |
|---|---|
| PW001 | Conforms to the upstream v0.2 schema |
| PW002 | No undefined members (strict profile) |
| PW101 | Consent age band equals response age band |
| PW102 | Under 15: consent by a parent, or confirmed by one |
| PW103 | A withdrawn consent is never sent |
| PW104 | Confirmation and withdrawal are not earlier than collection |
| PW105 | `connect.church` is among the purposes |
| PW106 | Exactly one contact method |
| PW107 | No duplicate purposes or recipients |
| PW108 / PW109 | Consent not in the future / not older than the receiver's policy |
| PW201 | The receiver is a named recipient, or next-nearby is allowed |
| PW202 / PW203 | Warnings: step not offered / minor to an organisation not verified for youth |
| PW301 | No personal data in events |
| PW302 – PW306 | Event `type`, `state`, `status`, `passReason`, `handoffId`, `orgId` are consistent |
| PW401 – PW404 | Legal transitions, nothing after deletion, no conflicting duplicates, time order |

Each is defined, with its source, in spec §7.

## Design decisions

- **Specify, don't fork.** The upstream schema is the base and is included
  unchanged. Every added rule cites the upstream text or the reference
  implementation's documented behaviour; anything else is a proposal in
  `docs/findings.md`.
- **Two encodings of the strict profile, tested against each other.** The
  JSON Schema and the TypeScript rules are written independently; the suite
  asserts they accept and reject the same vectors.
- **Strict by default.** Open objects let a sender attach personal data the
  person did not agree to share (finding F2).
- **Partial streams by default.** A receiver first sees a handoff when it is
  offered; a complete log is opt-in (`complete: true`).
- **Never throw, report everything.** Every entry point takes `unknown` and
  returns all determinable issues in one pass.
- **Minimal dependencies.** Ajv at runtime; TypeScript and `node:test` for
  development.

More in [`docs/rationale.md`](docs/rationale.md).

## Findings

Specifying v0.2 in full surfaced fourteen gaps, five of them high severity: no
message relates a response to its handoff and receiver; objects are open; the
two age bands can disagree; the under-15 parental rule is not in the schema
and child assent has no field; and others. Each has a proposal. See
[`docs/findings.md`](docs/findings.md).

## Relationship to Always Foundation

The Always Pathway standard is created and owned by Always Foundation and
licensed CC BY 4.0. This repository is independent work by Daniel Dizon, a
founding contributor to Always Foundation, that builds on the published
standard. It is not published, verified or endorsed by Always Foundation, and
it contains no Always Foundation code. "Always" and "Always Foundation" are
trademarks of Always Foundation, used here only to refer to the standard.

## Licence

- Code (`src/`, `test/`, `scripts/`): Apache License 2.0, see `LICENSE`.
- Specification text, strict schema and documentation: CC BY 4.0, see
  `LICENSE-CC-BY-4.0`.
- `spec/upstream/always-pathway-v0.2.schema.json`: © Always Foundation,
  CC BY 4.0, unchanged.

See `NOTICE` for attribution. Written with AI assistance (Claude); see the
commit trailers.
