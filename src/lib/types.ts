/** Difficulty labels shared by every puzzle type. */
export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert'

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard', 'expert']

export type PuzzleKind = 'nonogram' | 'sudoku' | 'sokoban'

export const PUZZLE_KINDS: readonly PuzzleKind[] = ['nonogram', 'sudoku', 'sokoban']
