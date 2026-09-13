type DeterministicBlock = { type: string };

export function gradeDeterministic(block: DeterministicBlock, answer: string): 'correct' | 'wrong';
export function isDeterministic(block: DeterministicBlock): boolean;
