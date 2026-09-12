// Pelanek 2016, Applications of the Elo rating system in adaptive educational
// systems. The recommended starting point is U(n) = a / (1 + b * n) with
// a = 1 and b = 0.05.
const A = 1;
const B = 0.05;

export function uncertainty(n) {
  return A / (1 + B * n);
}

export function expected(ability, difficulty) {
  return 1 / (1 + Math.exp(-(ability - difficulty)));
}

export function update(state, correct) {
  const p = expected(state.ability, state.difficulty);
  const error = correct - p;
  const adjustment = correct === 0.5 && error === 0 ? Number.EPSILON : error;
  return {
    ability: state.ability + uncertainty(state.abilityN) * adjustment,
    abilityN: state.abilityN + 1,
    difficulty: state.difficulty - uncertainty(state.difficultyN) * adjustment,
    difficultyN: state.difficultyN + 1,
  };
}
