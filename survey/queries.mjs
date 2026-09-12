// Versioned, gate-owned query vocabulary. These are candidates, not a proof
// that every execution is guarded. Neither the query nor its scope comes from
// the claim. A clean falsifier search is never affirmative evidence.
export const QUERY_VERSION = 2;

const QUERY = (enforcement, falsifier, extra = {}) => Object.freeze({ enforcement, falsifier, ...extra });

// The names in this table are the vocabulary the gate owns. A survey may name
// a kind, but it cannot smuggle in a regular expression that happens to match
// the file it just cited. The lexical queries are deliberately broad
// candidates; kinds that need ordering or control-flow semantics opt into a
// structural check in verify.mjs.
export const CONSTRAINT_QUERIES = Object.freeze({
  transactions: QUERY(
    String.raw`\b(?:withTransaction|beginTransaction|transaction)\s*\(`,
    String.raw`\b(?:insert|update|delete|save|write|execute|query)\s*\(`,
  ),
  tenancy: QUERY(
    String.raw`\b(?:withTenant|requireTenant|assertTenant|tenantScope)\s*\(`,
    String.raw`\b(?:findMany|findOne|query|execute|raw)\s*\(`,
  ),
  authentication: QUERY(
    String.raw`\b(?:authenticate|requireAuth|verifyToken|authorize)\s*\(`,
    String.raw`\b(?:skipAuth|allowAnonymous|disableAuth)\b`,
  ),
  'error-handling': QUERY(
    String.raw`\b(?:catch\s*\(|setErrorHandler\s*\(|onError\s*\()`,
    String.raw`\bcatch\s*\([^)]*\)\s*\{\s*\}`,
  ),
  'feature-flags': QUERY(
    String.raw`\b(?:isEnabled|featureEnabled|checkFlag)\s*\(`,
    String.raw`\b(?:forceEnable|bypassFlag|overrideFlag)\b`,
  ),
  serialization: QUERY(
    String.raw`\b(?:serialize|safeParse|validate|parse)\s*\(`,
    String.raw`\b(?:unsafeDeserialize|eval)\s*\(`,
  ),

  // This is the one ordering-sensitive query in the vocabulary. Its lexical
  // hits are only candidates; verify.mjs also proves that a validator is on
  // every path to a write-bearing call before this kind can be verified.
  'validation-before-persistence': QUERY(
    String.raw`\b(?:validate(?:[A-Z_$][\w$]*)?|assertValid(?:[A-Z_$][\w$]*)?|safeParse|parse)\s*\(`,
    String.raw`\b(?:write(?:[A-Z_$][\w$]*)?|save(?:[A-Z_$][\w$]*)?|store(?:[A-Z_$][\w$]*)?|persist(?:[A-Z_$][\w$]*)?|insert|update|create|put|append)\s*\(`,
    { structure: 'validation-before-write' },
  ),

  'authentication-before-handler': QUERY(
    String.raw`\b(?:authenticate|requireAuth|verifyToken|authorize|ensureAuthenticated)\s*\(`,
    String.raw`\b(?:allowAnonymous|skipAuth|disableAuth|publicHandler)\b`,
  ),
  idempotency: QUERY(
    String.raw`\b(?:idempotent|idempotencyKey|deduplicate|alreadyProcessed|findByRequestId)\s*\(`,
    String.raw`\b(?:processAgain|replay|duplicateRequest|withoutIdempotency)\b`,
  ),
  'rate-limiting': QUERY(
    String.raw`\b(?:rateLimit|rateLimiter|checkRateLimit|throttle|consumeToken|allowRequest)\s*\(`,
    String.raw`\b(?:withoutRateLimit|unlimited|disableRateLimit|skipRateLimit)\b`,
  ),
  'tenant-scoping': QUERY(
    String.raw`\b(?:withTenant|requireTenant|assertTenant|tenantScope|scopeToTenant|tenantId)\s*\(`,
    String.raw`\b(?:unscoped(?:Read|Query)?|findAll|allRecords|globalQuery|withoutTenant)\s*\(`,
  ),
  'input-sanitisation': QUERY(
    String.raw`\b(?:sanitize|sanitise|sanitizeInput|sanitiseInput|escape|normalise|normalize|cleanInput)\s*\(`,
    String.raw`\b(?:eval|innerHTML|unsafeHtml|rawQuery|executeRaw|trustInput)\s*\(`,
  ),

  // Common spellings are aliases, not new sources of evidence. Keeping them
  // here makes the controlled vocabulary usable across repositories that call
  // the same architectural rule "storage" or "scoped reads".
  'validation-before-storage': QUERY(
    String.raw`\b(?:validate(?:[A-Z_$][\w$]*)?|assertValid(?:[A-Z_$][\w$]*)?|safeParse|parse)\s*\(`,
    String.raw`\b(?:write(?:[A-Z_$][\w$]*)?|save(?:[A-Z_$][\w$]*)?|store(?:[A-Z_$][\w$]*)?|persist(?:[A-Z_$][\w$]*)?|insert|update|create|put|append)\s*\(`,
    { structure: 'validation-before-write' },
  ),
  'tenant-scoped-read': QUERY(
    String.raw`\b(?:withTenant|requireTenant|assertTenant|tenantScope|scopeToTenant|tenantId)\s*\(`,
    String.raw`\b(?:unscoped(?:Read|Query)?|findAll|allRecords|globalQuery|withoutTenant)\s*\(`,
  ),
  'input-sanitisation-before-use': QUERY(
    String.raw`\b(?:sanitize|sanitise|sanitizeInput|sanitiseInput|escape|normalise|normalize|cleanInput)\s*\(`,
    String.raw`\b(?:eval|innerHTML|unsafeHtml|rawQuery|executeRaw|trustInput)\s*\(`,
  ),
});
