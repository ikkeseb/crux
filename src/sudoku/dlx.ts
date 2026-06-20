/**
 * Knuth's Dancing Links (DLX) — an exact-cover solver.
 *
 * Sudoku reduces cleanly to exact cover: pick a set of (row,col,digit)
 * placements so that every cell is filled once and every digit appears once per
 * row, column and box. DLX solves that fast and, crucially for this game, can
 * *count* solutions up to a cap so we can prove a puzzle is unique.
 *
 * Implementation is the classic toroidal doubly-linked-list of nodes with
 * column headers and cover/uncover. `search` uses the min-size column heuristic
 * (MRV) and records how many recursion steps it took (`nodeCount`) — a clean
 * proxy for "how much search did the oracle need", used by difficulty grading.
 */

class DNode {
  left: DNode = this
  right: DNode = this
  up: DNode = this
  down: DNode = this
  col: DNode = this
  /** Originating row id (for solution rows); ignored on headers. */
  rowId = -1
  /** Number of nodes in this column (headers only). */
  size = 0
  /** Column index (headers only); -1 for spacer rows. */
  name = -1
}

export class Dlx {
  private readonly root: DNode
  private readonly columns: DNode[]
  /** Recursion steps taken by the last `search` — a search-effort metric. */
  nodeCount = 0

  constructor(numColumns: number) {
    this.root = new DNode()
    this.columns = []
    let prev = this.root
    for (let i = 0; i < numColumns; i++) {
      const c = new DNode()
      c.name = i
      c.col = c
      c.left = prev
      c.right = this.root
      prev.right = c
      this.root.left = c
      prev = c
      this.columns.push(c)
    }
  }

  /** Add a matrix row: `cols` are the column indices set to 1 in this row. */
  addRow(rowId: number, cols: readonly number[]): void {
    let first: DNode | null = null
    for (const ci of cols) {
      const c = this.columns[ci]!
      const n = new DNode()
      n.rowId = rowId
      n.col = c
      // Insert at the bottom of column c.
      n.up = c.up
      n.down = c
      c.up.down = n
      c.up = n
      c.size++
      // Link horizontally into this row.
      if (first === null) {
        first = n
        n.left = n
        n.right = n
      } else {
        n.left = first.left
        n.right = first
        first.left.right = n
        first.left = n
      }
    }
  }

  private cover(c: DNode): void {
    c.right.left = c.left
    c.left.right = c.right
    for (let i = c.down; i !== c; i = i.down) {
      for (let j = i.right; j !== i; j = j.right) {
        j.down.up = j.up
        j.up.down = j.down
        j.col.size--
      }
    }
  }

  private uncover(c: DNode): void {
    for (let i = c.up; i !== c; i = i.up) {
      for (let j = i.left; j !== i; j = j.left) {
        j.col.size++
        j.down.up = j
        j.up.down = j
      }
    }
    c.right.left = c
    c.left.right = c
  }

  /** Find up to `limit` exact covers; each is the list of selected row ids. */
  search(limit: number): number[][] {
    this.nodeCount = 0
    const solutions: number[][] = []
    const stack: number[] = []

    const recurse = (): void => {
      if (solutions.length >= limit) return
      if (this.root.right === this.root) {
        solutions.push(stack.slice())
        return
      }
      this.nodeCount++

      // Choose the column with the fewest options (MRV).
      let best = this.root.right
      let minSize = best.size
      for (let cc = this.root.right; cc !== this.root; cc = cc.right) {
        if (cc.size < minSize) {
          minSize = cc.size
          best = cc
        }
      }
      if (best.size === 0) return // unsatisfiable column → dead end

      this.cover(best)
      for (let r = best.down; r !== best && solutions.length < limit; r = r.down) {
        stack.push(r.rowId)
        for (let j = r.right; j !== r; j = j.right) this.cover(j.col)
        recurse()
        for (let j = r.left; j !== r; j = j.left) this.uncover(j.col)
        stack.pop()
      }
      this.uncover(best)
    }

    recurse()
    return solutions
  }
}
