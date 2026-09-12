const MAX_DEPTH = 32;

export function descendants(db, topicId) {
  const rows = db.prepare(`
    with recursive sub(id, depth) as (
      select id, 0 from topics where id = ?
      union
      select t.id, sub.depth + 1 from topics t join sub on t.parent = sub.id where sub.depth < ?
    )
    select distinct id from sub
  `).all(topicId, MAX_DEPTH);
  return rows.map((r) => r.id);
}

export function ancestors(db, topicId) {
  const rows = db.prepare(`
    with recursive up(id, parent, depth) as (
      select id, parent, 0 from topics where id = ?
      union
      select t.id, t.parent, up.depth + 1 from topics t join up on t.id = up.parent where up.depth < ?
    )
    select id from up order by depth
  `).all(topicId, MAX_DEPTH);
  return rows.map((r) => r.id);
}

export function topicsForProject(db, projectId) {
  return db.prepare('select topic from topic_projects where project = ? order by topic').all(projectId).map((r) => r.topic);
}

export function prerequisitesOf(db, topicId) {
  return db.prepare('select requires from topic_prereqs where topic = ? order by requires').all(topicId).map((r) => r.requires);
}

export function cardsForTopic(db, topicId) {
  const ids = descendants(db, topicId);
  if (ids.length === 0) return [];
  const marks = ids.map(() => '?').join(',');
  return db.prepare(`
    select distinct c.* from cards c
    join card_topics ct on ct.card = c.id
    where ct.topic in (${marks}) and c.retired = 0
    order by c.id
  `).all(...ids);
}
