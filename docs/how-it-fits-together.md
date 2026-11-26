# How it fits together: Dust, Pathway and Always

Millions of people watch, read and ask about the Christian faith online every week.
Very few of them are ever introduced to a local church, and the step where most are lost
is the hand-off from a screen to a person. This note describes how three independent
pieces of open infrastructure could join into one path from attention to a local church,
and which people and skills that path needs.

The longer argument, with sourced figures and a labelled funnel model, is the essay
[The harvest, the laborers and the hands between](https://danieldizon.ai/writings/the-harvest-and-the-laborers).

## Three layers, one job each

| Layer | Job | Who runs it | Where |
|---|---|---|---|
| **Dust** | Alignment. Checks what an AI is about to say against the Nicene Creed (381) and returns structured findings. Traditions add their own confession as a profile. | Rejoice | [DanielDizon-AI/dust](https://github.com/DanielDizon-AI/dust) |
| **Pathway** | Hand-off format. Carries a person's request to meet a church, with their consent, from any chat tool, site or app into any church system. Status flows back as events with no personal data. | Always Foundation publishes the standard; this repository is an independent implementer spec and validator | [DanielDizon-AI/pathway-standard](https://github.com/DanielDizon-AI/pathway-standard) |
| **Always** | Network. Routes consented hand-offs to churches that have agreed to follow up. Never pools ministries' data and rules out cross-organisation tracking of a person (ADR 0013). | Always Foundation, a US 501(c)(3) | [alwaysfoundation.org](https://alwaysfoundation.org) |

Each layer is useful alone and none depends on the others' internals. They meet only at
published interfaces: Dust's `POST /v1/evaluate` ([evaluate-api.md](https://github.com/DanielDizon-AI/dust/blob/main/docs/evaluate-api.md)) and
the Pathway v0.2 objects (`Organisation`, `Response` with its nested `Consent`, and `HandoffEvent`), specified in [spec/pathway-v0.2-spec.md](../spec/pathway-v0.2-spec.md).

## The path

```
 video · article · app            ┌── Dust boundary ──┐
 with an embedded invitation ───► │  AI agent answers  │ ───► human laborer
                                  └────────────────────┘      (prayer, care, hard cases)
                                                                    │ "yes, connect me"
                                                                    ▼
                                          Pathway Response + Consent ► Always network
                                                                    │
                                                                    ▼
                                                              local church
                                                                    │
 ◄──────────── HandoffEvent status: contacted · met_up · came_on_sunday · joined_group
```

1. **Attention.** A video, article or app carries a small embedded invitation to ask a
   question. Nothing is collected at this step.
2. **First reply.** An AI agent answers. Every draft passes through Dust; a blocked draft
   is repaired or replaced by a cited fallback, and anything outside validated languages
   or below confidence is flagged for a person.
3. **A person.** The agent hands over to a human laborer whenever the conversation turns
   personal, pastoral or urgent, and always before an introduction to a church.
4. **Hand-off.** When the person says yes, the platform writes a Pathway `Response` with an
   explicit `Consent`. Rules for minors apply first.
5. **Routing.** The Always network delivers it to a church, listed as an `Organisation`, that has agreed to receive
   introductions in that area and language.
6. **Feedback.** The church reports status events back, so a person who drops away is
   noticed and the sending ministry can see where its path thins.

## Rules that hold across every layer

- An agent always says it is an AI. It never claims to pray, never claims spiritual
  authority, and never presses for a decision.
- Great matters stay human: prayer, pastoral care, any sign of crisis or abuse, anything
  involving a minor, and the request to meet a church.
- Consent travels with the person and every data movement checks it, failing closed.
- Each layer keeps only what the next step needs. Dust can run on the user's own device
  and stores nothing.
- No layer links one person's activity across organisations, by any technique.

## The skills the network needs

The scarce resource in digital ministry is laborers, the people who answer, follow up
and welcome. Building and running this path needs a wider set of roles. AI tools,
including general-purpose assistants such as Claude, can do a large share of the
preparatory work in each role. The judgement in each role stays with a person.

| Role | What the work is | How AI tools help | What stays human |
|---|---|---|---|
| **Theology review** | Curate the boundary, review contested claims, write and approve confession profiles for each tradition | Draft candidate propositions and test claims, find proof texts and patristic sources, cluster disagreements for review | Every boundary decision and every profile sign-off, by named reviewers from each tradition |
| **Church onboarding** | Recruit churches willing to receive introductions, verify them, train a follow-up contact, keep listings current | Draft outreach and training material, check listings for staleness, answer setup questions, summarise each church's capacity | Verification, the relationship with each church, safeguarding checks |
| **Follow-up laborers** | Online missionaries and volunteers who carry conversations to a hand-off | Answer plain questions overnight, translate, summarise a conversation before a volunteer picks it up, draft replies for review | Prayer, pastoral care, crisis response, the introduction itself |
| **ML and evaluation** | Maintain Dust's guard and benchmarks, extend to new languages, test new open models | Generate and label candidate test claims, run evaluations, write analysis drafts | Final labels on the test set, release decisions, honest reporting of failures |
| **Privacy and legal** | Consent wording, data protection across jurisdictions, rules for minors, data-processing agreements | Map requirements across jurisdictions, draft notices and agreements, check implementations against the spec's privacy invariants | Legal sign-off by qualified counsel, decisions on what not to build |
| **Translation and localisation** | Interfaces, consent text, boundary propositions and test sets in each language | First-pass translation, back-translation checks, glossary consistency | Review by native speakers from local churches, especially of doctrinal and consent text |
| **Integration engineering** | Adapters from chat and ministry platforms to Pathway, conformance testing | Write adapters and tests against the published schemas, run the conformance suite | Code review, security review, deployment decisions |
| **Safeguarding** | Policies and escalation paths for minors and people at risk | Detect signals for escalation and route them to a person immediately | Every safeguarding response |

## Status

Dust v0.3, the Pathway implementer spec and validator, and the Always platform exist
today. The end-to-end path above is a proposed design: no ministry runs it yet, and the
figures in the essay are a model with labelled assumptions. Dust is a Rejoice project.
The Pathway implementer spec is independent work and is not published or endorsed by
Always Foundation. Neither repository speaks for any ministry or platform.
