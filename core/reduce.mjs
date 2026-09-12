import { canVouchClaim, validateClaim } from '../survey/claim.mjs';

function validateVouchClaim(claim) {
  try {
    validateClaim(claim);
  } catch (error) {
    throw new Error(`vouched claim is invalid: ${error.message}`);
  }
  if (!canVouchClaim(claim.status)) throw new Error(`claim status ${claim.status} cannot be vouched`);
}

const HANDLERS = {
  'project.added': (db, e) => {
    db.prepare('insert or replace into projects (id, name, remote, added) values (?, ?, ?, ?)')
      .run(e.data.project, e.data.name ?? e.data.project, e.data.remote ?? null, e.at.slice(0, 10));
  },
  'topic.added': (db, e) => {
    db.prepare('insert or replace into topics (id, name, parent, kind) values (?, ?, ?, ?)')
      .run(e.data.topic, e.data.name, e.data.parent ?? null, e.data.kind ?? 'technology');
    const gateStatus = e.data.gateStatus ?? e.data.claimStatus;
    const hasClaim = e.data.claim !== undefined && e.data.claim !== null;
    const hasGateStatus = gateStatus !== undefined && gateStatus !== null;
    if (hasClaim || hasGateStatus) {
      if (typeof e.data.claim !== 'string' || !e.data.claim.trim()) throw new Error('topic claim must be a non-empty string');
      if (typeof gateStatus !== 'string' || !gateStatus.trim()) throw new Error('topic gateStatus must be a non-empty string');
      db.prepare('insert or replace into topic_claims (topic, gate_status) values (?, ?)')
        .run(e.data.topic, gateStatus);
    }
  },
  'topic.linked': (db, e) => {
    db.prepare('insert or ignore into topic_projects (topic, project) values (?, ?)').run(e.data.topic, e.data.project);
  },
  'topic.prereq': (db, e) => {
    db.prepare('insert or ignore into topic_prereqs (topic, requires) values (?, ?)').run(e.data.topic, e.data.requires);
  },
  'card.added': (db, e) => {
    const d = e.data;
    db.prepare('delete from card_grounding where card = ?').run(d.card);
    const ground = db.prepare('insert or ignore into card_grounding (card, path, line, commit_sha) values (?, ?, ?, ?)');
    for (const g of d.grounding ?? []) ground.run(d.card, g.path, g.line ?? -1, g.commit ?? null);
    db.prepare(`insert or replace into cards
      (id, project, concept, ask, rubric, altitude, grounding, contexts, source, added, retired)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`)
      .run(d.card, d.project, d.concept, d.ask, JSON.stringify(d.rubric), d.altitude,
        JSON.stringify(d.grounding ?? []), JSON.stringify(d.contexts ?? []), JSON.stringify(d.source ?? {}), e.at.slice(0, 10));
    db.prepare('delete from card_topics where card = ?').run(d.card);
    const link = db.prepare('insert or ignore into card_topics (card, topic) values (?, ?)');
    for (const topic of d.topics ?? []) link.run(d.card, topic);
  },
  'card.updated': (db, e) => {
    const existing = db.prepare('select * from cards where id = ?').get(e.data.card);
    if (!existing) return false;
    const merged = { ...existing, ...e.data };
    db.prepare(`update cards set concept=?, ask=?, rubric=?, altitude=?, grounding=?, contexts=?, source=? where id=?`)
      .run(merged.concept, merged.ask,
        typeof merged.rubric === 'string' ? merged.rubric : JSON.stringify(merged.rubric),
        merged.altitude,
        typeof merged.grounding === 'string' ? merged.grounding : JSON.stringify(merged.grounding),
        typeof merged.contexts === 'string' ? merged.contexts : JSON.stringify(merged.contexts),
        typeof merged.source === 'string' ? merged.source : JSON.stringify(merged.source),
        e.data.card);
    if (Array.isArray(e.data.topics)) {
      db.prepare('delete from card_topics where card = ?').run(e.data.card);
      const link = db.prepare('insert or ignore into card_topics (card, topic) values (?, ?)');
      for (const topic of e.data.topics) link.run(e.data.card, topic);
    }
    // The grounding index is derived from the JSON, so an update to one has to
    // rewrite the other or the stale-card query quietly goes wrong.
    if (Array.isArray(e.data.grounding)) {
      db.prepare('delete from card_grounding where card = ?').run(e.data.card);
      const ground = db.prepare('insert or ignore into card_grounding (card, path, line, commit_sha) values (?, ?, ?, ?)');
      for (const g of e.data.grounding) ground.run(e.data.card, g.path, g.line ?? -1, g.commit ?? null);
    }
  },
  'card.retired': (db, e) => {
    db.prepare('update cards set retired = 1 where id = ?').run(e.data.card);
  },
  'attempt.recorded': (db, e) => {
    // agent_grade records what the grader said. grade is what currently stands.
    // They differ only after a contest, which is the whole point of keeping both.
    db.prepare(`insert or replace into attempts (id, card, at, grade, agent_grade, contested, question, context, answer, gap, mode)
      values (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`)
      .run(e.id, e.data.card, e.at, e.data.grade, e.data.grade, e.data.question ?? null, e.data.context ?? null,
        e.data.answer ?? null, e.data.gap ?? null, e.data.mode ?? 'drill');
  },
  'grade.contested': (db, e) => {
    const result = db.prepare('update attempts set grade = ?, contested = 1 where id = ?').run(e.data.userGrade, e.data.attempt);
    if (result.changes === 0) return false;
  },
  'lesson.completed': (db, e) => {
    const d = e.data;
    const status = d.status ?? 'completed';
    if (status === 'started') {
      db.prepare(`insert or replace into lesson_runs
        (id, lesson, at, completed, stopped_at_block) values (?, ?, ?, 0, null)`)
        .run(d.run, d.lesson, e.at);
      return;
    }
    if (status === 'abandoned') {
      const result = db.prepare('update lesson_runs set completed = 0, stopped_at_block = ? where id = ? and lesson = ?')
        .run(d.stoppedAtBlock, d.run, d.lesson);
      if (result.changes === 0) return false;
      return;
    }
    if (status === 'completed') {
      const result = db.prepare('update lesson_runs set completed = 1, stopped_at_block = null where id = ? and lesson = ?')
        .run(d.run, d.lesson);
      if (result.changes === 0) return false;
      return;
    }
    if (status === 'awaiting' || status === 'stored') {
      const result = db.prepare(`insert or replace into lesson_answers
        (id, run, lesson, block, card, answer, status, grade, feedback, at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, null, null, ?, ?)`)
        .run(d.answerId, d.run, d.lesson, d.block, d.card ?? null, d.answer, status, e.at, e.at);
      if (result.changes === 0) return false;
      return;
    }
    if (status === 'graded') {
      const result = db.prepare(`update lesson_answers
        set status = 'graded', grade = ?, feedback = ?, updated_at = ? where id = ?`)
        .run(d.grade, d.feedback ?? null, e.at, d.answerId);
      if (result.changes === 0) return false;
      return;
    }
    throw new Error(`lesson event status is unsupported: ${status}`);
  },
  'claim.vouched': (db, e) => {
    const claim = e.data.claim;
    validateVouchClaim(claim);
    db.prepare('insert or replace into vouches (claim, claim_json, judgement, vouched_at) values (?, ?, ?, ?)')
      .run(claim.id, JSON.stringify(claim), e.data.judgement, e.at);
  },
  'claim.vouch.withdrawn': (db, e) => {
    const result = db.prepare('delete from vouches where claim = ?').run(e.data.claim);
    if (result.changes === 0) return false;
  },
};

// Recording the event and deriving from it happen together or not at all.
// Without the savepoint a handler that throws leaves the event marked applied
// with nothing derived from it, and the retry returns false because the row is
// already there, so the derived tables disagree with the log permanently.
export function apply(db, event) {
  const name = `sp_${event.device}_${event.seq}`;
  db.exec(`savepoint ${name}`);
  try {
    const insert = db.prepare('insert or ignore into events (device, seq, at, type, v, data) values (?, ?, ?, ?, ?, ?)');
    const result = insert.run(event.device, event.seq, event.at, event.type, event.v, JSON.stringify(event.data));
    if (result.changes === 0) {
      db.exec(`release ${name}`);
      return false;
    }
    const handler = HANDLERS[event.type];
    const ok = handler ? handler(db, event) !== false : true;
    if (!ok) {
      // The row this event refers to has not arrived. Replay is in timestamp
      // order, not causal order, so this is expected across devices. Undo and
      // let rebuild retry it after the rest of the pass.
      db.exec(`rollback to ${name}`);
      db.exec(`release ${name}`);
      return 'deferred';
    }
    db.exec(`release ${name}`);
    return true;
  } catch (error) {
    db.exec(`rollback to ${name}`);
    db.exec(`release ${name}`);
    throw error;
  }
}

// readAll already skips a log line it cannot parse, on the principle that one
// bad line must not destroy the history around it. An event whose handler
// throws gets the same courtesy here. Quarantining it costs one event; letting
// it throw costs the whole log, because the database is a disposable cache and
// an event that is always fatal means the cache can never be rebuilt again.
// The quarantined events are returned rather than swallowed: a silent skip is
// its own kind of lie, and the caller has to be able to say what was dropped.
export function rebuild(db, events) {
  let applied = 0;
  const deferred = [];
  const quarantined = [];
  const attempt = (event) => {
    try {
      return apply(db, event);
    } catch (error) {
      // apply has already rolled back to its own savepoint, so nothing of this
      // event is left behind and the enclosing transaction is still usable.
      quarantined.push({
        id: event.id ?? `${event.device}:${event.seq}`,
        device: event.device,
        seq: event.seq,
        type: event.type,
        at: event.at,
        reason: error?.message || String(error),
      });
      return 'quarantined';
    }
  };
  db.exec('begin');
  try {
    for (const event of events) {
      const result = attempt(event);
      if (result === true) applied += 1;
      else if (result === 'deferred') deferred.push(event);
    }
    // One retry pass. An event still deferred after it refers to something that
    // is genuinely absent from the log rather than merely out of order.
    for (const event of deferred) if (attempt(event) === true) applied += 1;
    // Outside the per-event guard on purpose. A broken database rather than a
    // bad event leaves the transaction unusable and this commit still throws,
    // so an infrastructure failure is never reported as a quiet empty rebuild.
    db.exec('commit');
  } catch (error) {
    // Guarded: SQLite may already have rolled back, and an unguarded rollback
    // would throw over the top of the real error and hide it.
    try { db.exec('rollback'); } catch { /* already rolled back */ }
    throw error;
  }
  return { applied, quarantined };
}
