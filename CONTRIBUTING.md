# Contributing to Crux

Thank you for your interest in contributing to Crux! This document provides guidelines and instructions for contributing to the project.

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 8.0.0

### Setup

1. Clone the repository:

```bash
git clone https://github.com/yourusername/crux.git
cd crux
```

2. Install dependencies:

```bash
pnpm install
```

3. Start the development server:

```bash
pnpm dev
```

## Development Workflow

### Available Commands

- `pnpm dev` - Start development server (http://localhost:5173)
- `pnpm build` - Build for production
- `pnpm preview` - Preview production build
- `pnpm typecheck` - Run TypeScript type checking
- `pnpm test` - Run unit tests
- `pnpm test:watch` - Run tests in watch mode
- `pnpm test:coverage` - Run tests with coverage report
- `pnpm lint` - Lint code with ESLint
- `pnpm lint:fix` - Fix linting issues automatically
- `pnpm format` - Format code with Prettier
- `pnpm format:check` - Check code formatting
- `pnpm e2e` - Run Playwright E2E tests
- `pnpm screens` - Generate screenshots
- `pnpm validate` - Run all checks (typecheck + lint + format:check + test + build)

### Before Committing

**Always run the gate before committing:**

```bash
pnpm validate
```

This ensures:

- ✅ TypeScript types are correct
- ✅ Code passes linting
- ✅ Code is formatted (Prettier)
- ✅ All tests pass
- ✅ Build succeeds

## Code Style

### TypeScript

- Use **strict mode** (already configured)
- Prefer explicit types for public APIs
- Use `readonly` for immutable data structures
- Follow functional programming patterns where appropriate

### Formatting

This project uses Prettier for code formatting. Configuration is in `.prettierrc`:

- No semicolons
- Single quotes
- 2-space indentation
- 100 character line width
- Trailing commas

Run `pnpm format` before committing.

### Linting

ESLint is configured with TypeScript rules (flat config). Configuration is in `eslint.config.js`.

Key rules:

- Non-null assertions (`!`) are allowed (used extensively in solvers)
- Unused variables starting with `_` are ignored
- Prefer `const` over `let`

## Project Structure

```
src/
├── lib/          Seeded RNG, daily-seed helpers, shared types
├── nonogram/     Nonogram types, solver, generator, tests
├── sudoku/       Sudoku types, DLX, solver, generator, tests
├── sokoban/      Sokoban types, level utils, solver, generator, tests
└── ui/           DOM helpers, app shell, puzzle views

tests/e2e/        Playwright screenshot + interaction tests
```

## Core Principles

### The Solver is the Oracle

Each puzzle type has:

1. **Solver** - The authoritative source of correctness
2. **Generator** - Uses the solver to guarantee quality
3. **View** - Interactive player UI

The generator **must always** lean on the solver, never the other way around.

### Deterministic & Seeded

- All generation is seeded and deterministic (see `src/lib/rng.ts`)
- A given seed always produces the same puzzle
- This makes daily puzzles and reproducible tests possible

### XSS-Safe by Construction

- Use `src/ui/dom.ts` (`el`/`clear`) for DOM construction
- **Never** use `innerHTML` for dynamic content
- All text content is safely escaped via `textContent`

## Adding a New Puzzle Type

If adding a new puzzle type (e.g., "kakuro"):

1. Create `src/kakuro/` directory
2. Implement:
   - `types.ts` - Type definitions
   - `solver.ts` - Solver algorithm with tests
   - `generator.ts` - Generator that uses solver with tests
   - `*.test.ts` - Comprehensive tests
3. Create view in `src/ui/kakuro-view.ts`
4. Update `src/lib/types.ts` to add the puzzle kind
5. Wire it up in `src/ui/app.ts`

### Solver Requirements

- **Unit tests** - Known boards → known solutions
- **Property tests** - Generate N puzzles → solver confirms solvable/unique
- **Difficulty tests** - Verify grading sanity

Solvers are the load-bearing correctness surface. Change them only with tests, and adversarially verify uniqueness/solvability claims.

## Testing

### Unit Tests

Write tests alongside implementation:

- `solver.test.ts` - Test solver logic
- `generator.test.ts` - Test generation and difficulty grading
- Property tests using the seeded RNG

### E2E Tests

Add Playwright tests in `tests/e2e/` for:

- Visual regression (screenshots)
- User interactions
- State management (undo, restart, hints)

### Coverage

`vite.config.ts` enforces coverage thresholds on core logic (90% lines/
functions/statements, 85% branches); UI views, types, and entrypoints are
excluded from the report.

Run `pnpm test:coverage` to see coverage reports.

## Git Workflow

### Branches

- `main` - Production-ready code
- Feature branches - `feature/your-feature-name`
- Bug fixes - `fix/issue-description`

### Commit Messages

Use clear, descriptive commit messages:

```
feat: add X-wing technique to sudoku solver
fix: correct nonogram hint for edge cells
docs: update API documentation for generator
test: add property tests for sokoban solver
```

Format: `type: description`

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `chore`

### Pull Requests

1. Create a feature branch from `main`
2. Make your changes
3. Run `pnpm validate` to ensure all checks pass
4. Push and create a pull request
5. Describe your changes and rationale
6. Wait for review

## Common Issues

### TypeScript Errors

If you see type errors:

1. Run `pnpm typecheck` to see all errors
2. Check `tsconfig.json` for strict mode settings
3. Ensure all imports are correct

### Test Failures

If tests fail:

1. Run `pnpm test` to see which tests failed
2. Check if your changes affected solver correctness
3. Update tests if behavior change is intentional
4. Add new tests for new functionality

### Build Errors

If build fails:

1. Run `pnpm build` to see detailed errors
2. Check Vite configuration in `vite.config.ts`
3. Ensure all imports are resolvable

## Performance Considerations

- Solvers can be computationally intensive
- Property tests generate many puzzles
- Keep test timeouts reasonable (30s default)
- Profile before optimizing

## Questions?

- Open an issue for bugs or feature requests
- Check existing issues before creating new ones
- Be respectful and constructive

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.
