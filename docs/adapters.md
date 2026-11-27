# Adapters

An adapter connects an existing platform to Pathway. On the sending side it
turns a person's request to be connected into a Pathway `Response` and sends
it to a receiving church or ministry. On the receiving side it applies the
`HandoffEvent` stream that comes back. The platform keeps doing what it does
already; the adapter adds the handoff.

This document sets out what any adapter should do, then lists the reference
adapters that show it working end to end.

## Adapter profile

An adapter conforms to this profile when it does all of the following. Each
item names the part of the specification it depends on.

1. **Validate before sending and on arrival.** Every outgoing `Response` and
   every incoming `HandoffEvent` is checked against the strict profile
   (invariants PW001 to PW404, specification §7). Anything with an error is
   rejected and never forwarded.
2. **Capture consent from the person.** Consent is recorded at the moment the
   person asks to be connected, names the receiver they chose, carries one
   contact method, and follows the age rules: a parent consents for under-15s
   (PW102) and under-13s are never named. A consent older than the configured
   limit is not used.
3. **Send each consent once.** Retries reuse the same `handoffId`, so a
   receiver never sees the same person twice for one consent.
4. **Return status only.** Events that come back carry state and status, never
   personal data (PW301). Status is shown to the sender only when the person
   allowed `notify.sender`.
5. **Follow the state machine.** Events are applied in time order through the
   permitted transitions (specification §8). Redelivered events are applied
   once, and a recorded state never moves backwards.
6. **Honour withdrawal and deletion.** Withdrawing consent tells every
   receiver at once and stops further processing. After deletion, by either
   side, only a tombstone remains, and later events for that handoff are
   refused.
7. **Keep platform data on the platform.** The adapter stores no more than it
   needs to link a handoff back to its source, and nothing from the platform
   (reading history, conversation content, account data) is sent to the
   receiver beyond the `Response` itself.

## Reference adapters

Two adapters show the online-to-offline pathway from different kinds of
platform. Both are independent open-source projects in their own
repositories. Each depends on this package, validates with it, and keeps its
own terms and notices. A CI job in this repository
([`.github/workflows/adapters.yml`](../.github/workflows/adapters.yml)) runs
both test suites against every change to the standard.

| Adapter | Platform side | What it shows |
|---|---|---|
| [youversion-pathway-adapter](https://github.com/DanielDizon-AI/youversion-pathway-adapter) | A free Bible app built on the YouVersion Platform | A consent-first "connect with a local church" step beside the Bible text. Reading history and account data never reach the church. Requires the app to declare it meets the YouVersion Platform terms (non-commercial, no AI chat, no AI training). |
| [echoglobal-adapter](https://github.com/DanielDizon-AI/echoglobal-adapter) | An online ministry's conversations on the Echo platform | A responder records consent in a conversation and hands the person to a local church; outcomes from the church update the conversation in Echo. |

Neither adapter is affiliated with, or endorsed by, the platform it connects
to. Both have been tested against simulated platform APIs; neither has yet
been run against the live services. See each repository's README for its
scope and notices.

## Writing another adapter

Install this package, build the `Response` from the platform's data and the
person's consent, and call `validateHandoff` before sending and
`validateEventStream` on what comes back. The conformance vectors in
[`conformance/`](../conformance/) are language-neutral, so an adapter in
another language can be tested against the same cases.
