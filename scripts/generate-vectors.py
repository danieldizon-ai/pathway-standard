#!/usr/bin/env python3
"""Generate the conformance vectors in conformance/vectors and conformance/manifest.json.

Each vector is a small mutation of the upstream example (synthetic data).
`expect.codes` is the exact set of issue codes a conforming validator reports
under the strict profile, and `expect.valid` whether any is an error.
Run from the repository root: python3 scripts/generate-vectors.py
"""

import copy
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "conformance"
VEC = OUT / "vectors"

ORG_ID = "2f1d6a3e-8c1b-4a51-9b0e-1f7c2d9a4e10"
OTHER_ORG = "5b0c9e8d-7a6f-4e3d-8c2b-1a0f9e8d7c6b"
HANDOFF = "c7a1e2b3-4d5f-4a6b-9c8d-7e6f5a4b3c21"

ORG = {
    "id": ORG_ID,
    "kind": "church",
    "displayName": "Example Community Church",
    "trustLevel": "verified",
    "country": "GB",
    "region": "Greater Manchester",
    "suburb": "Salford",
    "postalCode": "M5 4WT",
    "languages": ["en", "zh-Hans"],
    "offers": ["church", "explore", "group"],
    "location": {"lat": 53.4875, "lng": -2.2901},
}
RESP = {
    "firstName": "Sam",
    "contact": {"mobile": "+447700900123"},
    "country": "GB",
    "region": "Greater Manchester",
    "ageBand": "18+",
    "step": "explore",
    "language": "en",
    "consent": {
        "id": "9b2e7c41-3d6f-4f0a-8e21-5a7c9d1b3f02",
        "purposes": ["connect.church", "notify.sender"],
        "recipients": [ORG_ID],
        "wordingVersion": "2026-11",
        "party": "self",
        "ageBand": "18+",
        "collectedAt": "2026-11-24T09:30:00Z",
    },
}


def event(etype, n, state=None, **data):
    d = {"handoffId": HANDOFF, "orgId": ORG_ID}
    if state:
        d["state"] = state
    d.update(data)
    return {
        "specversion": "1.0",
        "type": etype,
        "source": "https://example-church.org/pathway",
        "id": f"evt_{n:02d}",
        "time": f"2026-11-24T{10 + n:02d}:00:00Z",
        "data": d,
    }


EVENT = event("handoff.accepted", 1, "accepted")
manifest = []


def vec(name, kind, value, codes, description, options=None, valid=None):
    errors = {"PW202", "PW203", "PW404"}
    if valid is None:
        valid = all(c in errors for c in codes)
    (VEC / f"{name}.json").write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")
    entry = {"file": f"vectors/{name}.json", "kind": kind, "description": description,
             "expect": {"valid": valid, "codes": sorted(set(codes))}}
    if options:
        entry["options"] = options
    manifest.append(entry)


def resp(**changes):
    r = copy.deepcopy(RESP)
    consent = changes.pop("consent", None)
    for k, v in changes.items():
        if v is None:
            r.pop(k, None)
        else:
            r[k] = v
    if consent:
        for k, v in consent.items():
            if v is None:
                r["consent"].pop(k, None)
            else:
                r["consent"][k] = v
    return r


def org(**changes):
    o = copy.deepcopy(ORG)
    o.update(changes)
    return o


def ev(base, **changes):
    e = copy.deepcopy(base)
    data = changes.pop("data", None)
    e.update(changes)
    if data:
        for k, v in data.items():
            if v is None:
                e["data"].pop(k, None)
            else:
                e["data"][k] = v
    return e


VEC.mkdir(parents=True, exist_ok=True)
for f in VEC.glob("*.json"):
    f.unlink()

# Bundles and organisations
vec("bundle-upstream-example", "bundle", {"organisation": ORG, "response": RESP, "event": EVENT}, [],
    "The upstream example file, unchanged apart from the first name the website substitutes.")
vec("organisation-valid", "organisation", ORG, [], "A complete directory entry.")
vec("organisation-minimal", "organisation",
    {k: ORG[k] for k in ("id", "kind", "displayName", "trustLevel", "country")}, [],
    "Only the required members.")
vec("organisation-unknown-member", "organisation", org(email="hello@example.org"), ["PW002"],
    "A member the standard does not define. Accepted by the base profile.")
vec("organisation-unknown-member-base", "organisation", org(email="hello@example.org"), [],
    "The same entry under the base profile, which ignores unknown members.", {"profile": "base"})
vec("organisation-lowercase-country", "organisation", org(country="gb"), ["PW001"],
    "Country codes are upper-case ISO 3166-1 alpha-2.")
vec("organisation-nested-unknown", "organisation", org(location={"lat": 53.4875, "lng": -2.2901, "alt": 30}),
    ["PW002"], "Unknown member inside a nested object.")

# Responses
vec("response-valid-adult", "response", RESP, [], "An adult consenting for themselves.")
vec("response-valid-13-14-parent", "response",
    resp(ageBand="13-14", consent={"ageBand": "13-14", "party": "parent"}), [],
    "A 13 to 14 year old with consent given by a parent.")
vec("response-valid-13-14-confirmed", "response",
    resp(ageBand="13-14", consent={"ageBand": "13-14", "parentConfirmedAt": "2026-11-24T12:00:00Z"}), [],
    "A 13 to 14 year old who consented, later confirmed by a parent.")
vec("response-valid-15-17-self", "response", resp(ageBand="15-17", consent={"ageBand": "15-17"}), [],
    "A 15 to 17 year old may consent for themselves.")
vec("response-valid-under13", "response",
    resp(firstName=None, ageBand="under13", consent={"ageBand": "under13", "party": "parent"}), [],
    "Under 13: no first name, parent's contact, parent's consent.")
vec("response-under13-named", "response",
    resp(ageBand="under13", consent={"ageBand": "under13", "party": "parent"}), ["PW001"],
    "Under 13s are never named (upstream schema).")
vec("response-13-14-self", "response", resp(ageBand="13-14", consent={"ageBand": "13-14"}), ["PW102"],
    "Under 15 consenting alone, with no parental confirmation.")
vec("response-age-mismatch", "response", resp(consent={"ageBand": "13-14"}), ["PW101", "PW102"],
    "Consent records a younger band than the response; the lower band applies, so PW102 also fails.")
vec("response-withdrawn", "response", resp(consent={"withdrawnAt": "2026-11-25T08:00:00Z"}), ["PW103"],
    "A withdrawn consent must not travel.")
vec("response-withdrawn-stored", "response", resp(consent={"withdrawnAt": "2026-11-25T08:00:00Z"}), [],
    "The same record validated as stored, not sent.", {"sending": False})
vec("response-withdrawn-before-collected", "response", resp(consent={"withdrawnAt": "2026-11-20T08:00:00Z"}),
    ["PW103", "PW104"], "Withdrawal earlier than collection.")
vec("response-confirmation-before-collected", "response",
    resp(ageBand="13-14", consent={"ageBand": "13-14", "parentConfirmedAt": "2026-11-01T00:00:00Z"}),
    ["PW104"], "Parental confirmation earlier than the consent it confirms.")
vec("response-no-connect-purpose", "response", resp(consent={"purposes": ["notify.sender", "resources"]}),
    ["PW105"], "Handing someone on needs the connect.church purpose.")
vec("response-two-contact-methods", "response",
    resp(contact={"mobile": "+447700900123", "email": "sam@example.org"}), ["PW106"],
    "Upstream says one contact method.")
vec("response-empty-contact", "response", resp(contact={}), ["PW106"], "An empty contact object.")
vec("response-duplicate-purpose", "response",
    resp(consent={"purposes": ["connect.church", "connect.church"]}), ["PW107"], "Purposes are a set.")
vec("response-date-of-birth", "response", resp(dateOfBirth="2001-04-02"), ["PW002"],
    "Extra personal data the person did not agree to share.")
vec("response-bad-mobile", "response", resp(contact={"mobile": "0412 345 678"}), ["PW001"],
    "Mobile numbers are E.164.")
vec("response-future-consent", "response", RESP, ["PW108"], "Consent dated after the validation clock.",
    {"now": "2026-11-01T00:00:00Z"})
vec("response-stale-consent", "response", RESP, ["PW109"],
    "Consent older than a receiver's 365-day policy.", {"now": "2028-01-01T00:00:00Z", "maxConsentAgeDays": 365})

# Handoffs (response + receiver)
vec("handoff-valid", "handoff", {"response": RESP, "receiver": ORG}, [], "Named recipient, offered step.")
vec("handoff-recipient-not-covered", "handoff", {"response": RESP, "receiver": org(id=OTHER_ORG)}, ["PW201"],
    "Receiver not named, and next-nearby not allowed.")
vec("handoff-next-nearby", "handoff",
    {"response": resp(consent={"allowNextNearby": True}), "receiver": org(id=OTHER_ORG)}, [],
    "Receiver not named, but the person allowed a nearby alternative.")
vec("handoff-step-not-offered", "handoff", {"response": RESP, "receiver": org(offers=["church"])}, ["PW202"],
    "Warning only: the receiver does not list the requested step.")
vec("handoff-minor-to-unverified", "handoff",
    {"response": resp(ageBand="15-17", consent={"ageBand": "15-17"}), "receiver": ORG}, ["PW203"],
    "Warning only: a minor offered to an organisation not verified for youth work.")
vec("handoff-minor-to-verified-youth", "handoff",
    {"response": resp(ageBand="15-17", consent={"ageBand": "15-17"}), "receiver": org(trustLevel="verified_youth")},
    [], "A minor offered to a youth-verified organisation.")

# Events
vec("event-valid-accepted", "event", EVENT, [], "The upstream example event.")
vec("event-valid-passed", "event", event("handoff.passed", 2, "routing", passReason="capacity"), [],
    "A pass with its reason.")
vec("event-valid-status", "event", event("handoff.status_changed", 3, "contacted", status="contacted"), [],
    "A status update.")
vec("event-valid-organisation", "event",
    {**event("organisation.verified", 4), "data": {"orgId": ORG_ID}}, [], "An organisation event.")
vec("event-email-in-subject", "event", ev(EVENT, subject="sam@example.org"), ["PW301"],
    "Personal data in a CloudEvents attribute.")
vec("event-phone-in-source", "event", ev(EVENT, source="tel:+447700900123"), ["PW301"],
    "Personal data in the event source.")
vec("event-extension-attribute", "event", ev(EVENT, traceparent="00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01"),
    ["PW002"], "CloudEvents extension attributes are closed in the strict profile.")
vec("event-extension-attribute-base", "event",
    ev(EVENT, traceparent="00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01"), [],
    "Permitted in the base profile.", {"profile": "base"})
vec("event-first-name-in-data", "event", ev(EVENT, data={"firstName": "Sam"}), ["PW001", "PW002"],
    "Upstream closes data; the strict profile reports the member too.")
vec("event-missing-handoff-id", "event", ev(EVENT, data={"handoffId": None}), ["PW302"],
    "A handoff event must name its handoff.")
vec("event-state-mismatch", "event", ev(EVENT, data={"state": "closed"}), ["PW303"],
    "handoff.accepted cannot report state closed.")
vec("event-pass-without-reason", "event", event("handoff.passed", 2, "routing"), ["PW304"],
    "A pass must give its reason.")
vec("event-reason-on-accept", "event", ev(EVENT, data={"passReason": "fit"}), ["PW304"],
    "passReason belongs only on handoff.passed.")
vec("event-status-missing", "event", event("handoff.status_changed", 3, "contacted"), ["PW305"],
    "A status update without a status.")
vec("event-status-on-offer", "event", event("handoff.offered", 0, "offered", status="contacted"), ["PW305"],
    "status belongs only on handoff.status_changed.")
vec("event-organisation-with-handoff", "event", event("organisation.suspended", 4), ["PW306"],
    "Organisation events concern an organisation, not a handoff.")

# Streams
offered = event("handoff.offered", 0, "offered")
accepted = event("handoff.accepted", 1, "accepted")
contacted = event("handoff.status_changed", 2, "contacted", status="contacted")
closed = event("handoff.status_changed", 3, "closed", status="came_on_sunday")
withdrawn = event("consent.withdrawn", 2, "withdrawn")
deleted = event("person.deleted", 3, "withdrawn")
vec("stream-happy-path", "stream", [offered, accepted, contacted, closed], [],
    "Offered, accepted, contacted, closed.")
vec("stream-happy-path-complete", "stream", [offered, accepted, contacted, closed], [],
    "The same, as a complete log.", {"complete": True})
vec("stream-skip-acceptance", "stream", [offered, ev(contacted, id="evt_05")], ["PW401"],
    "Offered straight to contacted.")
vec("stream-accept-after-withdrawal", "stream", [offered, ev(withdrawn, time="2026-11-24T10:30:00Z"), ev(accepted, time="2026-11-24T11:00:00Z")],
    ["PW401"], "Nothing follows withdrawal.")
vec("stream-event-after-deletion", "stream", [offered, accepted, withdrawn, deleted,
    ev(closed, id="evt_09", time="2026-11-24T20:00:00Z")], ["PW402"], "A status update after the person's data was deleted.")
vec("stream-redelivery", "stream", [offered, accepted, copy.deepcopy(accepted)], [],
    "An exact redelivery is processed once.")
vec("stream-conflicting-duplicate", "stream", [offered, accepted, ev(accepted, data={"state": "offered"}, type="handoff.offered")],
    ["PW403"], "Two different events with the same source and id.")
vec("stream-out-of-order", "stream", [accepted, offered], ["PW404"],
    "Supplied out of time order; valid once sorted (warning only).")
vec("stream-pass-and-reoffer", "stream", [
    offered,
    event("handoff.passed", 1, "routing", passReason="language"),
    ev(offered, id="evt_02", time="2026-11-24T12:00:00Z", data={"orgId": OTHER_ORG}),
    ev(accepted, id="evt_03", time="2026-11-24T13:00:00Z", data={"orgId": OTHER_ORG}),
], [], "One receiver passes; the next accepts.")
vec("stream-partial-starts-accepted", "stream", [accepted, contacted], [],
    "A sender with notify.sender first hears at acceptance.")
vec("stream-complete-starts-accepted", "stream", [accepted, contacted], ["PW401"],
    "The same events cannot be a complete log.", {"complete": True})
vec("stream-parent-expiry", "stream", [event("handoff.expired", 0, "withdrawn")], [],
    "Parental confirmation expired before routing (complete log).", {"complete": True})

(OUT / "manifest.json").write_text(json.dumps({
    "description": "Conformance vectors for the Always Pathway v0.2 strict profile. See conformance/README.md.",
    "vectors": manifest,
}, indent=2) + "\n")
print(f"{len(manifest)} vectors")
