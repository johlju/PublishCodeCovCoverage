# ESLint Configuration for PublishCodeCovCoverage

This project uses ESLint with TypeScript support to maintain code quality and consistency. Here's how to use ESLint in this project:

## Available Scripts

- `npm run lint` - Run ESLint on production code only (src directory, excluding test files)
- `npm run lint:all` - Run ESLint on all TypeScript files, including tests
- `npm run lint:fix` - Run ESLint and automatically fix issues that can be fixed
- `npm run lint:report` - Run ESLint with zero tolerance for warnings and output to a text file
- `npm run format` - Run Prettier to format code
- `npm run format:check` - Check if code meets Prettier formatting standards
- `npm run lint-and-fix` - Run Prettier and then ESLint with auto-fix

## ESLint Configuration

The ESLint configuration is in `.eslintrc.js`. It includes:

- TypeScript-specific rules with `@typescript-eslint`
- Jest testing rules with `eslint-plugin-jest`
- Integration with Prettier using `eslint-config-prettier`

## Current State and Future Improvements

The current ESLint setup primarily uses warnings instead of errors to allow for gradual improvement of the codebase. This approach helps to:

1. Identify areas for improvement without breaking the build
2. Enable incremental adoption of best practices
3. Provide guidance for new code while not blocking work on existing code

### Priority Issues to Address

1. Replace uses of logical OR (`||`) with nullish coalescing operator (`??`) where appropriate
2. Add proper return types to functions
3. Reduce usage of `any` type
4. Handle unsafe type operations with proper type guards
5. Address console statements by replacing with proper logging

## For New Code

For new code, try to adhere to all ESLint rules and avoid introducing new warnings.

## Editor Integration

This project includes VS Code settings that integrate ESLint and Prettier. With the ESLint and Prettier VS Code extensions installed:

- Errors and warnings will be highlighted in the editor
- Files will be formatted on save
- ESLint auto-fixable issues will be fixed on save

## References

- [ESLint Documentation](https://eslint.org/)
- [TypeScript ESLint](https://typescript-eslint.io/)
- [Prettier](https://prettier.io/)
