# ESLint Todo List

This is a list of improvements that could be made to the codebase to address ESLint warnings:

> **Note:** The GitHub Actions workflow is configured with `--max-warnings=0`, which means that any warnings will cause the CI build to fail. Address these warnings to ensure successful CI builds.

## High Priority

- [ ] Replace logical OR (`||`) with nullish coalescing operator (`??`) in common files:
  - `src/PublishCodeCovCoverageTask/index.ts`
  - `src/PublishCodeCovCoverageTask/utils/webUtils.ts`

## Medium Priority

- [ ] Add proper return types to functions in `webUtils.ts`
- [ ] Fix unsafe type operations with proper type guards
- [ ] Implement proper assertion functions for tests to address jest/expect-expect warnings
- [ ] Replace uses of `any` with more specific types

## Low Priority

- [ ] Consider implementing a proper logging service instead of console statements
- [ ] Add proper error handling with custom error types

## How to Contribute

1. Pick an item from this list
2. Create a branch for your changes
3. Make the changes and ensure the linting passes with `npm run lint`
4. Submit a PR

Refer to [ESLint Documentation](docs/eslint.md) for more details about our ESLint setup.
