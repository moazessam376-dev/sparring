import { DatabaseSync } from 'node:sqlite';

export const SCHEMA_VERSION = 1;

const SCHEMA = `
create table if not exists events (
  device text not null,
  seq integer not null,
  at text not null,
  type text not null check (type in ('project.added', 'topic.added', 'topic.linked', 'topic.prereq',
    'card.added', 'card.updated', 'card.retired', 'attempt.recorded', 'grade.contested', 'lesson.completed')),
  v integer not null,
  data text not null check (json_valid(data)),
  primary key (device, seq)
);
create table if not exists projects (
  id text primary key, name text not null, remote text, added text not null
);
create table if not exists topics (
  id text primary key, name text not null, parent text,
  kind text not null check (kind in ('technology', 'concept', 'skill'))
);
create table if not exists topic_projects (
  topic text not null, project text not null, primary key (topic, project)
);
create table if not exists topic_prereqs (
  topic text not null, requires text not null, primary key (topic, requires)
);
create table if not exists cards (
  id text primary key, project text not null, concept text not null, ask text not null,
  rubric text not null check (json_valid(rubric)),
  altitude text not null check (altitude in ('map', 'boundary', 'mechanism', 'line')),
  grounding text not null check (json_valid(grounding)),
  contexts text not null check (json_valid(contexts)),
  source text not null check (json_valid(source)),
  added text not null,
  retired integer not null default 0 check (retired in (0, 1))
);
create table if not exists card_topics (
  card text not null, topic text not null, primary key (card, topic)
);
create table if not exists card_grounding (
  card text not null, path text not null, line integer not null default -1, commit_sha text,
  primary key (card, path, line)
);
create table if not exists lessons (
  id text primary key, project text not null, title text not null,
  created text not null, blocks integer not null default 0
);
create table if not exists lesson_topics (
  lesson text not null, topic text not null, primary key (lesson, topic)
);
create table if not exists lesson_runs (
  id text primary key, lesson text not null, at text not null,
  completed integer not null default 0 check (completed in (0, 1)),
  stopped_at_block integer
);
create table if not exists attempts (
  id text primary key, card text not null, at text not null,
  grade text not null check (grade in ('correct', 'partial', 'wrong')),
  agent_grade text check (agent_grade in ('correct', 'partial', 'wrong')),
  contested integer not null default 0 check (contested in (0, 1)),
  question text, context text, answer text, gap text,
  mode text not null check (mode in ('drill', 'mock', 'transfer', 'lesson'))
);
create table if not exists card_sched (
  card text primary key, stability real, fsrs_difficulty real, due text,
  reps integer not null default 0, lapses integer not null default 0,
  last_at text, last_grade text check (last_grade is null or last_grade in ('correct', 'partial', 'wrong'))
);
create table if not exists card_elo (
  card text primary key, rating real not null default 0, n integer not null default 0
);
create table if not exists topic_elo (
  topic text primary key, rating real not null default 0, n integer not null default 0
);
create table if not exists meta (key text primary key, value text not null);
create index if not exists attempts_by_card on attempts (card, at);
create index if not exists cards_by_project on cards (project);
create index if not exists topics_by_parent on topics (parent);
create index if not exists sched_by_due on card_sched (due);
create index if not exists grounding_by_commit on card_grounding (commit_sha);
`;

// No foreign keys are declared, deliberately. Events replay in timestamp order
// rather than causal order, so an attempt can legitimately arrive before the
// card it belongs to. Referential integrity is the reducer's job, not the
// schema's, and a pragma here would promise something the tables do not keep.
export function open(file) {
  const db = new DatabaseSync(file);
  db.exec('pragma journal_mode = wal');
  db.exec(SCHEMA);
  const row = db.prepare("select value from meta where key = 'schema_version'").get();
  const found = row ? Number(row.value) : null;
  if (found !== null && found !== SCHEMA_VERSION) {
    // The cache is a rebuildable projection, so a version mismatch is fixed by
    // discarding it rather than by migrating it.
    throw new Error(`stale cache: schema ${found}, expected ${SCHEMA_VERSION}; delete the cache and rebuild`);
  }
  db.prepare('insert or replace into meta (key, value) values (?, ?)').run('schema_version', String(SCHEMA_VERSION));
  return db;
}
