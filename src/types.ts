/**
 * TypeScript types for the Always Pathway v0.2 message types.
 *
 * These mirror `spec/upstream/always-pathway-v0.2.schema.json` exactly. They
 * describe a value *after* it has passed schema validation; the validator
 * itself accepts `unknown`.
 */

export const AGE_BANDS = ['under13', '13-14', '15-17', '18+'] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

export const STEP_CATEGORIES = ['church', 'explore', 'talk', 'youth', 'group', 'help', 'read'] as const;
export type StepCategory = (typeof STEP_CATEGORIES)[number];

export const TRUST_LEVELS = ['listed', 'claimed', 'verified', 'verified_youth'] as const;
export type TrustLevel = (typeof TRUST_LEVELS)[number];

export const PURPOSES = ['connect.church', 'notify.sender', 'resources', 'stats.anonymous'] as const;
export type Purpose = (typeof PURPOSES)[number];

export const HANDOFF_STATES = [
  'awaiting_parent',
  'routing',
  'offered',
  'accepted',
  'contacted',
  'care_team',
  'closed',
  'withdrawn',
] as const;
export type HandoffState = (typeof HANDOFF_STATES)[number];

export const STATUSES = ['contacted', 'met_up', 'came_on_sunday', 'joined_group', 'not_ready', 'asked_to_stop'] as const;
export type Status = (typeof STATUSES)[number];

export const PASS_REASONS = ['capacity', 'language', 'fit', 'safeguarding', 'other'] as const;
export type PassReason = (typeof PASS_REASONS)[number];

export const EVENT_TYPES = [
  'handoff.offered',
  'handoff.accepted',
  'handoff.passed',
  'handoff.expired',
  'handoff.rerouted',
  'handoff.status_changed',
  'consent.withdrawn',
  'person.deleted',
  'organisation.verified',
  'organisation.suspended',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface Organisation {
  id: string;
  kind: 'church' | 'ministry' | 'network';
  displayName: string;
  trustLevel: TrustLevel;
  country: string;
  denomination?: string;
  category?: string;
  suburb?: string;
  location?: GeoPoint;
  website?: string;
  offers?: StepCategory[];
  lastConfirmedAt?: string;
  source?: { url?: string; date?: string };
  region?: string;
  postalCode?: string;
  languages?: string[];
}

export interface Consent {
  id: string;
  purposes: Purpose[];
  recipients: string[];
  allowNextNearby?: boolean;
  wordingVersion: string;
  party: 'self' | 'parent';
  ageBand: AgeBand;
  collectedAt: string;
  parentConfirmedAt?: string;
  withdrawnAt?: string;
}

export interface Response {
  firstName?: string;
  contact?: { mobile?: string; email?: string };
  suburb?: string;
  ageBand: AgeBand;
  step: StepCategory;
  language?: string;
  campaignId?: string;
  placementId?: string;
  consent: Consent;
  country?: string;
  region?: string;
  postalCode?: string;
}

export interface HandoffEventData {
  handoffId?: string;
  orgId?: string;
  state?: HandoffState;
  status?: Status;
  passReason?: PassReason;
}

export interface HandoffEvent {
  specversion: '1.0';
  type: EventType;
  source: string;
  id: string;
  time: string;
  data: HandoffEventData;
  [extension: string]: unknown;
}
