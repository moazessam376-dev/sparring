const freeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};

export const SCHEMA_VERSION = 1;

// The field names and their catalogue types are deliberately data. The
// validator knows how to interpret these type descriptions, but it does not
// know any component names.
export const COMPONENTS = freeze({
  prose: {
    required: { heading: 'string', body: 'markdown', names: 'string[]' },
    optional: {},
    gradable: false,
    grading: 'none',
  },
  diagram: {
    required: {
      nodes: '{id,label,sub,focal}[]',
      edges: '{from,to,label}[]',
      caption: 'string',
    },
    optional: {},
    shapes: {
      nodes: { required: { id: 'string', label: 'string', sub: 'string', focal: 'boolean' }, optional: {} },
      edges: { required: { from: 'string', to: 'string', label: 'string' }, optional: {} },
    },
    gradable: false,
    grading: 'none',
  },
  trace: {
    required: { steps: '{text,file,line}[]', commit: 'string' },
    optional: {},
    shapes: {
      steps: { required: { text: 'string', file: 'string', line: 'integer' }, optional: {} },
    },
    gradable: false,
    grading: 'none',
  },
  terminal: {
    required: { lines: '{cmd,out}[]', cwd: 'string' },
    optional: {},
    shapes: {
      lines: { required: { cmd: 'string', out: 'string' }, optional: {} },
    },
    gradable: false,
    grading: 'none',
  },
  short: {
    required: { ask: 'string', rubric: 'string[]', grounding: '{path,line,commit}' },
    optional: {},
    shapes: {
      grounding: {
        required: { path: 'string', line: 'integer', commit: 'string' },
        optional: {},
        nonEmpty: ['path', 'commit'],
      },
    },
    gradable: true,
    grading: 'agent',
  },
  code: {
    required: { ask: 'string', languages: 'string[]', starter: 'string', reviewAgainst: '{path,line}' },
    optional: {},
    shapes: {
      reviewAgainst: { required: { path: 'string', line: 'integer' }, optional: {} },
    },
    gradable: true,
    grading: 'agent-review',
  },
  recall: {
    required: { situation: 'string', answer: 'string', accept: 'string[]' },
    optional: {},
    gradable: true,
    grading: 'exact',
  },
  lure: {
    required: { ask: 'string', options: '{text,correct,why}[]' },
    optional: {},
    shapes: {
      options: { required: { text: 'string', correct: 'boolean' }, optional: { why: 'string' } },
    },
    rules: [
      { kind: 'exactly-one-true', field: 'options', property: 'correct' },
      { kind: 'required-when', field: 'options', when: { property: 'correct', equals: false }, required: 'why' },
    ],
    gradable: true,
    grading: 'exact',
  },
  order: {
    required: { ask: 'string', steps: 'string[]', order: 'number[]' },
    optional: {},
    rules: [{ kind: 'permutation-of', field: 'order', source: 'steps' }],
    gradable: true,
    grading: 'exact',
  },
  blank: {
    required: { snippet: 'string', blanks: '{at,answer,distractors}[]', file: '{path,line}' },
    optional: {},
    shapes: {
      blanks: { required: { at: 'integer', answer: 'string', distractors: 'string[]' }, optional: {} },
      file: { required: { path: 'string', line: 'integer' }, optional: {} },
    },
    rules: [{ kind: 'positions-in-string', field: 'blanks', position: 'at', source: 'snippet' }],
    gradable: true,
    grading: 'exact',
  },
  place: {
    required: { diagram: 'ref', place: '{label,target}[]' },
    optional: {},
    shapes: {
      place: { required: { label: 'string', target: 'string' }, optional: {} },
    },
    gradable: true,
    grading: 'exact',
  },
  explainself: {
    required: { prompt: 'string' },
    optional: {},
    gradable: false,
    grading: 'stored',
  },
  schema: {
    required: { columns: 'string[]', rows: 'string[][]', highlight: 'number[]' },
    optional: {},
    gradable: false,
    grading: 'none',
  },
  timeline: {
    required: { events: '{at,label,lane}[]', unit: 'string' },
    optional: {},
    shapes: {
      events: { required: { at: 'number', label: 'string', lane: 'string' }, optional: {} },
    },
    gradable: false,
    grading: 'none',
  },
  reqres: {
    required: { request: 'object', response: 'object', focus: 'string' },
    optional: {},
    gradable: false,
    grading: 'none',
  },
});
