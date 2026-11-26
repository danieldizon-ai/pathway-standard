/**
 * Issue codes. Each corresponds to one invariant in
 * `spec/pathway-v0.2-spec.md` §7, with the same identifier.
 */

export type Severity = 'error' | 'warning';

export interface CodeInfo {
  readonly severity: Severity;
  readonly summary: string;
  /** Whether `schema/pathway-v0.2-strict.schema.json` can express this rule. */
  readonly schemaExpressible: boolean;
}

export const CODES = {
  PW001: { severity: 'error', summary: 'Does not conform to the upstream v0.2 schema', schemaExpressible: true },
  PW002: { severity: 'error', summary: 'Unknown member (strict profile)', schemaExpressible: true },
  PW101: { severity: 'error', summary: 'Consent age band differs from response age band', schemaExpressible: true },
  PW102: { severity: 'error', summary: 'Under 15 without parent consent or confirmation', schemaExpressible: true },
  PW103: { severity: 'error', summary: 'Consent has been withdrawn', schemaExpressible: true },
  PW104: { severity: 'error', summary: 'Consent timestamps out of order', schemaExpressible: false },
  PW105: { severity: 'error', summary: 'Purpose connect.church not granted', schemaExpressible: true },
  PW106: { severity: 'error', summary: 'Contact must have exactly one method', schemaExpressible: true },
  PW107: { severity: 'error', summary: 'Duplicate purpose or recipient', schemaExpressible: true },
  PW108: { severity: 'error', summary: 'Consent collected in the future', schemaExpressible: false },
  PW109: { severity: 'error', summary: 'Consent older than the maximum consent age', schemaExpressible: false },
  PW201: { severity: 'error', summary: 'Receiver not covered by consent', schemaExpressible: false },
  PW202: { severity: 'warning', summary: 'Receiver does not offer the requested step', schemaExpressible: false },
  PW203: { severity: 'warning', summary: 'Minor offered to an organisation not verified for youth', schemaExpressible: false },
  PW301: { severity: 'error', summary: 'Personal data in an event', schemaExpressible: false },
  PW302: { severity: 'error', summary: 'Handoff event without handoffId', schemaExpressible: true },
  PW303: { severity: 'error', summary: 'State not permitted for this event type', schemaExpressible: true },
  PW304: { severity: 'error', summary: 'passReason present without handoff.passed, or missing on it', schemaExpressible: true },
  PW305: { severity: 'error', summary: 'status present without handoff.status_changed, or missing on it', schemaExpressible: true },
  PW306: { severity: 'error', summary: 'Organisation event must carry orgId and no handoffId', schemaExpressible: true },
  PW401: { severity: 'error', summary: 'Illegal state transition', schemaExpressible: false },
  PW402: { severity: 'error', summary: 'Event after person.deleted', schemaExpressible: false },
  PW403: { severity: 'error', summary: 'Conflicting events share source and id', schemaExpressible: false },
  PW404: { severity: 'warning', summary: 'Events supplied out of time order', schemaExpressible: false },
} as const satisfies Record<string, CodeInfo>;

export type Code = keyof typeof CODES;

export interface Issue {
  readonly code: Code;
  readonly severity: Severity;
  /** JSON Pointer (RFC 6901) to the offending location, relative to the validated value. */
  readonly path: string;
  readonly message: string;
}

export interface Result {
  /** True when there are no error-severity issues. Warnings do not affect validity. */
  readonly valid: boolean;
  readonly issues: readonly Issue[];
}

export function issue(code: Code, path: string, message?: string): Issue {
  const info = CODES[code];
  return { code, severity: info.severity, path, message: message ?? info.summary };
}

export function result(issues: readonly Issue[]): Result {
  return { valid: !issues.some((i) => i.severity === 'error'), issues };
}
