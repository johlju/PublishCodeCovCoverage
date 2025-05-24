# ESLint Configuration for PublishCodeCovCoverage

This project uses ESLint with TypeScript and Prettier integration to maintain code quality and consistency.

## Available Scripts

- `npm run lint` - Lint production code (`src` directory, excluding test files) with zero warnings allowed
- `npm run lint:all` - Lint all files, including tests and configs
- `npm run lint:fix` - Lint production code and auto-fix issues
- `npm run lint:report` - Lint all files, fail on any warning, and output to `eslint-report.txt`
- `npm run format` - Check formatting of all TypeScript files in `src` using Prettier
- `npm run format:fix` - Format all TypeScript files in `src` using Prettier
- `npm run fix` - Format and then auto-fix lint issues

## ESLint Configuration

- The main config is in `eslint.config.js` (flat config, ESM).
- Uses:
  - TypeScript rules via `@typescript-eslint`
  - Jest rules via `eslint-plugin-jest` for test files
  - Prettier integration via `eslint-plugin-prettier` and `eslint-config-prettier`
- Ignores: `dist/`, `coverage/`, `node_modules/`, and config files.
- Strict rules for production code, relaxed for test files.
- Most rules are warnings to allow gradual improvement, but some are errors (e.g., unused vars, no-debugger).

## TypeScript & Formatting

- TypeScript strict mode is enabled (`strict`, `noImplicitAny`, etc.).
- Prettier is enforced via ESLint and on save in VS Code.
- All TypeScript and test files are included in linting and formatting.

## Editor Integration

- VS Code settings auto-fix ESLint and format with Prettier on save.
- Install the ESLint and Prettier extensions for best experience.

## Current State and Future Improvements

- Most issues are warnings to allow incremental adoption.
- Priority improvements:
  1. Replace `||` with `??` where appropriate
  2. Add explicit return types to functions
  3. Reduce usage of `any`
  4. Add type guards for unsafe operations
  5. Replace `console` with proper logging

## For New Code

- Adhere to all ESLint and Prettier rules.
- Avoid introducing new warnings.

## References

- [ESLint Documentation](https://eslint.org/)
- [TypeScript ESLint](https://typescript-eslint.io/)
- [Prettier](https://prettier.io/)
