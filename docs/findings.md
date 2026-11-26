# Findings: gaps in Always Pathway v0.2

Specifying v0.2 in full (see `spec/pathway-v0.2-spec.md`) surfaced the gaps below.
Each says what is missing, why it matters, how this repository handles it,
and a proposal for a future upstream version. They are offered as review
input to the standard's maintainers, not as criticism: v0.2 is an open draft
that says "expect small changes before 1.0".

Severity is my judgement: **high** means two conforming implementations could
mishandle a person's data or consent; **medium** means they could disagree
about validity; **low** is editorial.

| # | Finding | Severity | Handled here by |
|---|---|---|---|
| F1 | No message relates a `Response` to its handoff and receiver | high | Out of scope; proposal below |
| F2 | Objects are open, so extra personal data passes validation | high | Strict profile, PW002 |
| F3 | "One method" of contact is prose only | medium | PW106 |
| F4 | Consent age band and response age band can disagree | high | PW101, lower band applies in PW102 |
| F5 | The parental-consent rule for under-15s is not in the schema; child assent has no field | high | PW102; assent noted, not enforced |
| F6 | No event type can report `awaiting_parent` | medium | Spec §8.2 note; complete-log start states |
| F7 | Event `type`, `state`, `status` and `passReason` are unconstrained relative to each other | medium | PW302 to PW306 |
| F8 | No lifecycle: any state may follow any other | medium | State machine, PW401, PW402 |
| F9 | No consent expiry field | medium | PW109 as a receiver policy |
| F10 | `recipients` may be empty | low | PW201 at handoff time |
| F11 | `purposes` and `recipients` are arrays without `uniqueItems` | low | PW107 |
| F12 | `wordingVersion` cannot be resolved to the wording shown | low | None |
| F13 | `Organisation.location` precision is unspecified | medium | Spec §3 SHOULD |
| F14 | `data.orgId` does not say whether it names the actor or the subject | low | Spec §6 |

## F1. No message relates a response to its handoff and receiver

A `Response` carries no `handoffId`, sender or receiver. Events carry a
`handoffId` but no response. The upstream example places an organisation, a
response and an event side by side without saying how they relate. Two
implementations will therefore invent different envelopes, and a receiver
cannot tie a later `consent.withdrawn` to the response it holds except through
an out-of-band mapping.

*Proposal.* A `HandoffOffer` message:

```json
{
  "handoffId": "uuid",
  "sender": "organisation uuid",
  "receiver": "organisation uuid",
  "offeredAt": "date-time",
  "respondBy": "date-time",
  "response": { "...": "Response" }
}
```

with the rule that `receiver` is in `response.consent.recipients` or
`allowNextNearby` is true (PW201 here).

## F2. Open objects

`Organisation`, `Response`, `Consent` and `contact` do not set
`additionalProperties: false` (only `HandoffEvent.data` does). A sender can add
`dateOfBirth`, `address` or free-text notes to a response and it still
validates. For a format whose purpose is to share only what a person agreed
to, the schema should refuse what it does not define. The strict profile does
this with `unevaluatedProperties: false` while reusing the upstream
definitions unchanged.

## F3. Contact method count

The description of `contact` says "One method", but `{}` and
`{ "mobile": …, "email": … }` both validate. `minProperties: 1,
maxProperties: 1` expresses the intent.

## F4. Two age bands

Age band appears on the response and on its consent. Nothing requires them to
agree. If a response says `18+` and its consent `13-14`, a receiver that reads
only the response skips parental checks. The reference validator reports the
mismatch (PW101) and applies the lower band (the reference implementation's
rule CY-3), so PW102 also fires. Upstream could either require equality with
`if`/`then` per band, as the strict schema here does, or drop one of the two.

## F5. Parental consent and child assent

The website promises that "a parent agrees for anyone under 15", and the
reference implementation enforces it, but the schema does not. Separately,
the reference implementation requires *child assent* alongside parental
consent for under-15s and records it as `childAssentAt`, a field v0.2 does not
have. A receiver therefore cannot tell from a message whether assent was
obtained. Proposal: add optional `childAssentAt` to `Consent`, required by
rule when `ageBand` is `under13` or `13-14`.

## F6. `awaiting_parent` is unreportable

`awaiting_parent` is a state, but no event type corresponds to entering it:
there is no `handoff.created`. A sender cannot tell a network that a handoff
is waiting on a parent, and a stream can only show `awaiting_parent` if some
event carries it with a type that does not describe it. Proposal: a
`handoff.created` event whose state is `awaiting_parent` or `routing`.

## F7. Event fields are independent in the schema

`handoff.accepted` may carry `state: "closed"`; `passReason` may appear on any
type; a `handoff.*` event may omit `handoffId`; an `organisation.*` event may
carry a `handoffId` and no `orgId`. §6.1 of the specification gives
the table of permitted combinations, and the strict schema encodes it with
`if`/`then`.

## F8. No lifecycle

v0.2 lists states and event types but no transitions, so `withdrawn` followed
by `accepted` is as valid as `offered` followed by `accepted`. The
specification defines a transition relation (§8) chosen to admit everything
the reference implementation's engine can do and nothing it cannot, plus the
rule that nothing follows `person.deleted`.

## F9. Consent expiry

The reference implementation treats consent as lasting 12 months unless
renewed, but v0.2 has no `expiresAt`. A receiver cannot know the sender's
policy. Here, PW109 lets a receiver apply its own maximum. Proposal: optional
`expiresAt` on `Consent`.

## F10. Empty recipients

`recipients` has no `minItems`. A consent naming no recipient with
`allowNextNearby: false` permits a handoff to nobody, which is better caught
at creation than at the receiver.

## F11. Sets as arrays

`purposes` and `recipients` are sets. `uniqueItems: true` says so.

## F12. Wording version

`wordingVersion` is a free string. Without a way to retrieve the wording, an
auditor cannot check what the person agreed to. A URI, or a registry of
wording versions per sender, would close this.

## F13. Location precision

`Organisation.location` has no stated precision. A small church or house group
meeting in a home would publish that home's coordinates. The
specification adds that it SHOULD be the locality centroid.

## F14. `orgId` semantics

On `handoff.offered`, `orgId` is presumably the receiver offered; on
`handoff.passed`, the receiver that passed; on `organisation.verified`, the
organisation verified. A sentence per type in the standard would settle it.
