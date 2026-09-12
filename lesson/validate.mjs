import { COMPONENTS, SCHEMA_VERSION } from './schema.mjs';

const DOCUMENT_FIELDS = Object.freeze({
  version: 'version',
  id: 'string',
  project: 'string',
  title: 'string',
  topics: 'string[]',
  blocks: 'block[]',
  created: 'string',
});

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function add(errors, block, field, message) {
  errors.push({ block, field, message });
}

function pathField(field, suffix) {
  return suffix ? `${field}.${suffix}` : field;
}

function expectedType(value, type) {
  if (type === 'string' || type === 'markdown' || type === 'ref') {
    if (typeof value !== 'string') return `must be ${type === 'markdown' ? 'a string' : 'a string'}`;
    if (type === 'ref' && value.trim() === '') return 'must be a non-empty reference string';
    return null;
  }
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value) ? null : 'must be a finite number';
  if (type === 'integer') return Number.isInteger(value) ? null : 'must be an integer';
  if (type === 'boolean') return typeof value === 'boolean' ? null : 'must be a boolean';
  if (type === 'object') return isRecord(value) ? null : 'must be an object';
  return null;
}

function shapeFromType(type) {
  const match = /^\{([^}]*)\}(\[\])?$/.exec(type);
  if (!match) return null;
  const required = {};
  const optional = {};
  for (const rawName of match[1].split(',').map((name) => name.trim()).filter(Boolean)) {
    if (rawName.endsWith('?')) optional[rawName.slice(0, -1)] = 'string';
    else required[rawName] = 'string';
  }
  return { required, optional, array: Boolean(match[2]) };
}

function checkShape(value, shape, errors, block, field) {
  if (!isRecord(value)) {
    add(errors, block, field, 'must be an object');
    return false;
  }

  const required = isRecord(shape?.required) ? shape.required : {};
  const optional = isRecord(shape?.optional) ? shape.optional : {};
  const allowed = new Set([...Object.keys(required), ...Object.keys(optional)]);

  for (const [name, type] of Object.entries(required)) {
    if (!Object.prototype.hasOwnProperty.call(value, name)) {
      add(errors, block, pathField(field, name), 'is required');
      continue;
    }
    checkType(value[name], type, null, errors, block, pathField(field, name));
  }
  for (const [name, type] of Object.entries(optional)) {
    if (Object.prototype.hasOwnProperty.call(value, name)) {
      checkType(value[name], type, null, errors, block, pathField(field, name));
    }
  }
  for (const name of Object.keys(value)) {
    if (!allowed.has(name)) add(errors, block, pathField(field, name), 'unknown field');
  }

  for (const name of shape?.nonEmpty ?? []) {
    if (Object.prototype.hasOwnProperty.call(value, name)
      && typeof value[name] === 'string' && value[name].trim() === '') {
      add(errors, block, pathField(field, name), 'must be non-empty');
    }
  }
  return true;
}

function checkType(value, type, shape, errors, block, field) {
  if (typeof type !== 'string') {
    add(errors, block, field, 'has an invalid schema type');
    return false;
  }

  const primitiveError = expectedType(value, type);
  if (primitiveError) {
    add(errors, block, field, primitiveError);
    return false;
  }
  if (type === 'string' || type === 'markdown' || type === 'ref'
    || type === 'number' || type === 'integer' || type === 'boolean' || type === 'object') return true;

  if (type === 'string[]' || type === 'number[]' || type === 'integer[]' || type === 'boolean[]') {
    if (!Array.isArray(value)) {
      add(errors, block, field, `must be an array of ${type.slice(0, -2)} values`);
      return false;
    }
    const itemType = type.slice(0, -2);
    for (let index = 0; index < value.length; index += 1) {
      checkType(value[index], itemType, null, errors, block, `${field}[${index}]`);
    }
    return true;
  }
  if (type === 'string[][]') {
    if (!Array.isArray(value)) {
      add(errors, block, field, 'must be an array of string arrays');
      return false;
    }
    for (let row = 0; row < value.length; row += 1) {
      checkType(value[row], 'string[]', null, errors, block, `${field}[${row}]`);
    }
    return true;
  }

  const parsed = shapeFromType(type);
  if (parsed) {
    if (parsed.array) {
      if (!Array.isArray(value)) {
        add(errors, block, field, 'must be an array');
        return false;
      }
      const itemShape = shape ?? { required: parsed.required, optional: parsed.optional };
      for (let index = 0; index < value.length; index += 1) {
        checkShape(value[index], itemShape, errors, block, `${field}[${index}]`);
      }
      return true;
    }
    return checkShape(value, shape ?? parsed, errors, block, field);
  }

  add(errors, block, field, `uses unsupported schema type "${type}"`);
  return false;
}

function validComponentSchema(component) {
  return isRecord(component) && isRecord(component.required) && isRecord(component.optional);
}

function validateRules(blockValue, component, errors, block) {
  if (!Array.isArray(component.rules)) return;
  for (const rule of component.rules) {
    if (!isRecord(rule) || typeof rule.kind !== 'string') continue;
    const value = blockValue[rule.field];

    if (rule.kind === 'exactly-one-true') {
      if (!Array.isArray(value)) continue;
      const trueCount = value.filter((item) => isRecord(item) && item[rule.property] === true).length;
      if (trueCount !== 1) {
        add(errors, block, rule.field, `must contain exactly one option with ${rule.property}=true`);
      }
      continue;
    }

    if (rule.kind === 'required-when') {
      if (!Array.isArray(value)) continue;
      for (let index = 0; index < value.length; index += 1) {
        const item = value[index];
        if (!isRecord(item) || item[rule.when?.property] !== rule.when?.equals) continue;
        const why = item[rule.required];
        if (typeof why !== 'string' || why.trim() === '') {
          add(errors, block, `${rule.field}[${index}].${rule.required}`, 'is required for this option');
        }
      }
      continue;
    }

    if (rule.kind === 'permutation-of') {
      const source = blockValue[rule.source];
      if (!Array.isArray(value) || !Array.isArray(source)) continue;
      if (value.some((item) => !Number.isInteger(item))) continue;
      const expectedLength = source.length;
      const unique = new Set(value);
      const isPermutation = value.length === expectedLength
        && unique.size === expectedLength
        && value.every((item) => item >= 0 && item < expectedLength);
      if (!isPermutation) add(errors, block, rule.field, 'must be a permutation of the step indices');
      continue;
    }

    if (rule.kind === 'positions-in-string') {
      const source = blockValue[rule.source];
      if (typeof source !== 'string' || !Array.isArray(value)) continue;
      for (let index = 0; index < value.length; index += 1) {
        const item = value[index];
        if (!isRecord(item) || !Number.isInteger(item[rule.position])) continue;
        const position = item[rule.position];
        if (position < 0 || position >= source.length) {
          add(errors, block, `${rule.field}[${index}].${rule.position}`, 'does not point to a position in the snippet');
        }
      }
    }
  }
}

function validateBlock(blockValue, blockIndex, component) {
  const errors = [];
  const required = component.required;
  const optional = component.optional;
  const shapes = isRecord(component.shapes) ? component.shapes : {};
  const allowed = new Set(['type', ...Object.keys(required), ...Object.keys(optional)]);

  for (const [field, type] of Object.entries(required)) {
    if (!Object.prototype.hasOwnProperty.call(blockValue, field)) {
      add(errors, blockIndex, field, 'is required');
      continue;
    }
    checkType(blockValue[field], type, shapes[field], errors, blockIndex, field);
  }
  for (const [field, type] of Object.entries(optional)) {
    if (Object.prototype.hasOwnProperty.call(blockValue, field)) {
      checkType(blockValue[field], type, shapes[field], errors, blockIndex, field);
    }
  }
  for (const field of Object.keys(blockValue)) {
    if (!allowed.has(field)) add(errors, blockIndex, field, 'unknown field');
  }

  validateRules(blockValue, component, errors, blockIndex);
  return errors;
}

function validateDocumentFields(doc, errors) {
  const allowed = new Set(Object.keys(DOCUMENT_FIELDS));
  for (const field of Object.keys(DOCUMENT_FIELDS)) {
    if (!Object.prototype.hasOwnProperty.call(doc, field)) {
      add(errors, null, field, 'is required');
    }
  }
  for (const field of Object.keys(doc)) {
    if (!allowed.has(field)) add(errors, null, field, 'unknown field');
  }

  if (Object.prototype.hasOwnProperty.call(doc, 'version')) {
    if (doc.version !== SCHEMA_VERSION) add(errors, null, 'version', `must be schema version ${SCHEMA_VERSION}`);
  }
  if (Object.prototype.hasOwnProperty.call(doc, 'id')) checkType(doc.id, 'string', null, errors, null, 'id');
  if (Object.prototype.hasOwnProperty.call(doc, 'project')) checkType(doc.project, 'string', null, errors, null, 'project');
  if (Object.prototype.hasOwnProperty.call(doc, 'title')) checkType(doc.title, 'string', null, errors, null, 'title');
  if (Object.prototype.hasOwnProperty.call(doc, 'topics')) checkType(doc.topics, 'string[]', null, errors, null, 'topics');
  if (Object.prototype.hasOwnProperty.call(doc, 'blocks') && !Array.isArray(doc.blocks)) {
    add(errors, null, 'blocks', 'must be an array');
  }
  if (Object.prototype.hasOwnProperty.call(doc, 'created')) checkType(doc.created, 'string', null, errors, null, 'created');
}

/**
 * Validate a lesson without throwing. `components` is optional for tests and
 * callers that want to extend the frozen catalogue for one validation run.
 */
export function validate(doc, components = COMPONENTS) {
  const errors = [];
  if (!isRecord(doc)) {
    add(errors, null, 'document', 'must be an object');
    return { ok: false, errors };
  }

  validateDocumentFields(doc, errors);
  if (!Array.isArray(doc.blocks)) return { ok: errors.length === 0, ...(errors.length ? { errors } : {}) };

  if (doc.blocks.length > 40) add(errors, null, 'blocks', 'must contain no more than 40 blocks');

  const catalog = isRecord(components) ? components : {};
  let gradableCount = 0;
  for (let blockIndex = 0; blockIndex < doc.blocks.length; blockIndex += 1) {
    const block = doc.blocks[blockIndex];
    if (!isRecord(block)) {
      add(errors, blockIndex, 'block', 'must be an object');
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(block, 'type')) {
      add(errors, blockIndex, 'type', 'is required');
      continue;
    }
    if (typeof block.type !== 'string') {
      add(errors, blockIndex, 'type', 'must be a component type string');
      continue;
    }
    const component = catalog[block.type];
    if (!validComponentSchema(component)) {
      add(errors, blockIndex, 'type', `unknown component type "${block.type}"`);
      continue;
    }
    if (component.gradable === true) gradableCount += 1;
    errors.push(...validateBlock(block, blockIndex, component));
  }

  if (gradableCount === 0) {
    add(errors, null, 'blocks', 'lesson must contain at least one gradable block');
  } else if (gradableCount < 3) {
    add(errors, null, 'blocks', 'lesson must contain at least 3 gradable blocks');
  }
  if (gradableCount > 12) add(errors, null, 'blocks', 'lesson must contain no more than 12 gradable blocks');

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
