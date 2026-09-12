// Versioned, gate-owned query vocabulary. These are candidates, not a proof
// that every execution is guarded. Neither the query nor its scope comes from
// the claim. A clean falsifier search is never affirmative evidence.
export const QUERY_VERSION = 1;
export const CONSTRAINT_QUERIES = Object.freeze({
  transactions: Object.freeze({
    enforcement: String.raw`\b(?:withTransaction|beginTransaction|transaction)\s*\(`,
    falsifier: String.raw`\b(?:insert|update|delete|save|write|execute|query)\s*\(`,
  }),
  tenancy: Object.freeze({
    enforcement: String.raw`\b(?:withTenant|requireTenant|assertTenant|tenantScope)\s*\(`,
    falsifier: String.raw`\b(?:findMany|findOne|query|execute|raw)\s*\(`,
  }),
  authentication: Object.freeze({
    enforcement: String.raw`\b(?:authenticate|requireAuth|verifyToken|authorize)\s*\(`,
    falsifier: String.raw`\b(?:skipAuth|allowAnonymous|disableAuth)\b`,
  }),
  'error-handling': Object.freeze({
    enforcement: String.raw`\b(?:catch\s*\(|setErrorHandler\s*\(|onError\s*\()`,
    falsifier: String.raw`\bcatch\s*\([^)]*\)\s*\{\s*\}`,
  }),
  'feature-flags': Object.freeze({
    enforcement: String.raw`\b(?:isEnabled|featureEnabled|checkFlag)\s*\(`,
    falsifier: String.raw`\b(?:forceEnable|bypassFlag|overrideFlag)\b`,
  }),
  serialization: Object.freeze({
    enforcement: String.raw`\b(?:serialize|safeParse|validate|parse)\s*\(`,
    falsifier: String.raw`\b(?:unsafeDeserialize|eval)\s*\(`,
  }),
});
