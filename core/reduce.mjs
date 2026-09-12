const HANDLERS = {
  'project.added': (db, e) => {
    db.prepare('insert or replace into projects (id, name, remote, added) values (?, ?, ?, ?)')
      .run(e.data.project, e.data.name ?? e.data.project, e.data.remote ?? null, e.at.slice(0, 10));
  },
  'topic.added': (db, e) => {
    db.prepare('insert or replace into topics (id, name, parent, kind) values (?, ?, ?, ?)')
      .run(e.data.topic, e.data.name, e.data.parent ?? null, e.data.kind ?? 'technology');
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
  'lesson.completed': () => {
    // Lesson records are read from the log directly until the lesson system exists.
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

export function rebuild(db, events) {
  let applied = 0;
  const deferred = [];
  db.exec('begin');
  try {
    for (const event of events) {
      const result = apply(db, event);
      if (result === true) applied += 1;
      else if (result === 'deferred') deferred.push(event);
    }
    // One retry pass. An event still deferred after it refers to something that
    // is genuinely absent from the log rather than merely out of order.
    for (const event of deferred) if (apply(db, event) === true) applied += 1;
    db.exec('commit');
  } catch (error) {
    // Guarded: SQLite may already have rolled back, and an unguarded rollback
    // would throw over the top of the real error and hide it.
    try { db.exec('rollback'); } catch { /* already rolled back */ }
    throw error;
  }
  return applied;
}
