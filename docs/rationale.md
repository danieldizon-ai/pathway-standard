# Design rationale

Why this repository is shaped the way it is, and why the standard it
specifies makes the choices it does.

## Part 1. The standard's design

These are the properties of Always Pathway v0.2 that the specification
preserves, with the reasoning as I understand it. Credit for the design
belongs to Always Foundation.

### Content once, status many times

A person's details cross a boundary once per handoff; everything afterwards is
a status event with no personal data. Most referral systems send the record
again with each update, or keep a shared record both sides edit. Separating
the two means the high-sensitivity payload has one recipient and one moment of
transfer, while the operationally chatty part (offered, accepted, contacted)
is safe to log, queue, retry and fan out. It also makes data minimisation
testable: an event containing an email address is wrong by inspection
(PW301).

### Consent travels with the person

The consent record travels inside the response. A receiver can decide whether it may process the response from the
message alone, and a withdrawal can be checked against the exact record it
withdraws. The structure follows the consent-record model of ISO/IEC TS 27560:
purposes, recipients, wording version, the party who consented, and when.

### Age before anything else

Age is exchanged as a band, never a date of birth. Bands are what the rules
need (under 13 never named, under 15 needs a parent, under 18 goes only to
youth-verified organisations), and a band is far less identifying than a date.

### Each step is its own handoff

A person who goes from an event to a course to a church is three handoffs with
three consents and three identifiers. Nothing in the format links them. This
is deliberate: Always Foundation's ADR 0013 records its decision not to build
any capability to recognise the same person across organisations, by any
technique. The specification makes it a MUST NOT for implementations
too (§11).

### Borrowed envelopes

Events use CloudEvents 1.0, so they fit existing brokers, webhooks and
tooling. The lifecycle resembles HL7 FHIR `Task`; the directory resembles
Open Referral HSDS. Approximate correspondence of states:

| Pathway | FHIR `Task.status` |
|---|---|
| `awaiting_parent` | `on-hold` |
| `routing` | `ready` |
| `offered` | `requested` |
| `accepted` | `accepted` |
| `contacted` | `in-progress` |
| `care_team` | `on-hold` (different owner) |
| `closed` | `completed` |
| `withdrawn` | `cancelled` |

FHIR `rejected` corresponds to `handoff.passed`, after which Pathway re-routes
the same handoff where FHIR would usually create a new Task.

## Part 2. This repository's design

### Specify, don't fork

The upstream schema is included unchanged and remains the base. The
specification restates it and adds invariants, each labelled with its source.
Anything not traceable to the upstream text or the reference implementation's
documented behaviour is confined to the strict profile or marked as a
proposal (`findings.md`). A fork would have been faster and less useful: the
point is to make the existing standard precise enough that independent
implementations agree.

### Stable invariant codes

Every rule has a code (PW001 to PW404) used identically in the specification,
the validator's output, the conformance vectors and the tests. A reviewer can
go from a validator message to the sentence in the spec that justifies it, and
an implementer in another language can match the vectors by code rather than
by message text.

### Two independent encodings, checked against each other

The strict profile exists twice: as a JSON Schema (for anyone with a schema
validator and nothing else) and as TypeScript (for rules a schema cannot
express). The PW002 check in code is derived from the upstream schema's
`properties`, not from the strict schema, and the other rules are written
separately from their schema counterparts. The test suite then asserts that
the strict schema accepts exactly the vectors on which the validator reports
no schema-expressible error. Any disagreement means one of the two encodings is
wrong, and the test names the vector on which they differ.

### Strict by default

The validator applies the strict profile unless asked not to. For a format
whose purpose is to share only what someone agreed to, accepting unknown
members by default is the wrong failure mode. The base profile remains
available for interoperating with systems that add harmless metadata.

### Errors and warnings

An error means a conforming receiver must reject the message. A warning means
the message is valid but probably not what the sender intended:
offering a step the receiver does not list (PW202), offering a minor to an
organisation not verified for youth work (PW203, an error in the reference
implementation's policy but not in the standard), or out-of-order delivery
(PW404, which the receiver must handle anyway). Warnings never change
`valid`.

### Partial streams by default

A system first hears of a handoff wherever it joins it, so the state machine
accepts any first state unless told the stream is a complete log. Rejecting
partial streams would make the validator useless to every receiver.

### The personal-data check is a heuristic

PW301 searches every string in an event for patterns that look like email
addresses or E.164 numbers. It will miss a name and could flag an unusual
identifier. It is there because the most likely leak is a contact detail
pasted into `subject` or an extension attribute, and the strict profile
already closes everything else.

### Pure functions, no exceptions

Every validator entry point takes `unknown`, never throws on malformed input,
and returns all issues it can determine rather than stopping at the first.
Rules run after PW001 failures, guarding every access, so one pass reports
"wrong country format" and "under-15 without parent" together.

### Minimal dependencies

Runtime: Ajv and ajv-formats, the reference JSON Schema 2020-12 validator for
JavaScript. Development: TypeScript and Node's built-in test runner. No test
framework, bundler or linter configuration to keep current.

## Non-goals

- **Transport, authentication and authorisation.** The format assumes an
  authenticated channel (§10); defining one is a separate problem.
- **Cross-handoff identity.** See above.
- **Routing.** Which receiver to offer is a policy decision outside the format.
- **Replacing the upstream standard.** This is a review and reference
  implementation, offered back.
