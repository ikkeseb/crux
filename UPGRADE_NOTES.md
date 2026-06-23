# Version Upgrade Notes

## Current Versions (as of 2026-06-23)

- Node.js: 20.0.0 (minimum; Node 18 reached end-of-life in April 2025)
- TypeScript: 5.9.3
- Vite: 6.4.3
- Vitest: 3.2.6
- ESLint: 10.5.0
- Prettier: 3.8.4

## Available Major Upgrades

### Immediate Consideration

- **Vite**: 6.4.3 → 8.1.0 (major version jump)
  - Breaking changes likely
  - Need to review Vite 7 and 8 migration guides
  - May affect build pipeline and dev server

- **Vitest**: 3.2.6 → 4.1.9 (major version jump)
  - Breaking changes likely
  - Coverage package must match version
  - All tests must be verified after upgrade

### Consider Later

- **TypeScript**: 5.9.3 → 6.0.3 (major version jump)
  - Breaking changes in TS 6.0
  - Strict mode may catch new issues
  - Review migration guide before upgrading

- **@types/node**: 22.19.21 → 26.0.0
  - Should match actual Node.js version in use
  - Consider Node.js 20 LTS or 22 LTS

## Recommendation

These are **major version** upgrades that should be done separately:

1. Test each upgrade in isolation
2. Review breaking changes and migration guides
3. Verify all tests pass after each upgrade
4. Update documentation if APIs change

## When to Upgrade

- After current changes are committed and stable
- In a separate PR/branch for easier rollback
- When time allows for thorough testing
- Check community feedback on new versions first
