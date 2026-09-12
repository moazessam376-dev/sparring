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
    for (const g of d.grounding ?? []) ground.run(d.card, g.path, g.line ?? null, g.commit ?? null);
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
    if (!existing) return;
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
      for (const g of e.data.grounding) ground.run(e.data.card, g.path, g.line ?? null, g.commit ?? null);
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
    db.prepare('update attempts set grade = ?, contested = 1 where id = ?').run(e.data.userGrade, e.data.attempt);
  },
  'lesson.completed': () => {
    // Lesson records are read from the log directly until the lesson system exists.
  },
};

export function apply(db, event) {
  const insert = db.prepare('insert or ignore into events (device, seq, at, type, v, data) values (?, ?, ?, ?, ?, ?)');
  const result = insert.run(event.device, event.seq, event.at, event.type, event.v, JSON.stringify(event.data));
  if (result.changes === 0) return false;
  const handler = HANDLERS[event.type];
  if (handler) handler(db, event);
  return true;
}

export function rebuild(db, events) {
  let applied = 0;
  db.exec('begin');
  try {
    for (const event of events) if (apply(db, event)) applied += 1;
    db.exec('commit');
  } catch (error) {
    db.exec('rollback');
    throw error;
  }
  return applied;
}
