# Testing Documentation

This project uses Jest for testing and contains both unit tests and integration tests.

## Unit Tests

Unit tests are located in the `__tests__` directories throughout the codebase. They test isolated functionality of individual functions and modules, mocking external dependencies as needed.

### Running Unit Tests

```sh
npm run test
```

## Integration Tests

Integration tests are located in the `__integration_tests__` directories and test the interaction between multiple components, often making actual HTTP requests and file system operations. These tests provide a higher level of confidence, but are generally slower and require more resources.

Integration tests focus primarily on ensuring the full workflow executes without errors, rather than making specific assertions about intermediate states. They verify that components work together correctly in real-world scenarios.

### Running Integration Tests

```sh
npm run test:integration
```

### Current Integration Tests

1. **webUtils.integration.test.ts**
   - Tests the `downloadFile` function with progress tracking
   - Ensures the download process completes successfully without errors
   - Tests aborting downloads mid-progress
   - Uses a local test HTTP server for consistent testing
   - Focuses on workflow completion rather than specific assertions

## Running All Tests

To run both unit tests and integration tests:

```sh
npm run test:all
```

## Test Coverage

Test coverage reports are generated during the test run and are available in the `coverage` directory. The reports include:

- HTML report: `coverage/lcov-report/index.html`
- LCOV report: `coverage/lcov.info`
- Clover report: `coverage/clover.xml`
- JSON report: `coverage/coverage-final.json`

## Adding New Tests

### Adding Unit Tests

When adding functionality, create new unit tests in the appropriate `__tests__` directory:

```typescript
// Example unit test
describe('myFunction', () => {
    test('should do X when Y', () => {
        // Arrange
        // Act
        // Assert
    });
});
```

### Adding Integration Tests

When adding functionality that involves interaction with external systems (like file system, network, etc.), consider adding an integration test:

```typescript
// Example integration test
describe('feature integration', () => {
    beforeAll(() => {
        // Setup test environment
    });

    afterAll(() => {
        // Cleanup test environment
    });

    test('should perform end-to-end operation', async () => {
        // Arrange
        const outputLog = [];

        // Act - focus on running the workflow and capturing logs
        try {
            await someComplexOperation({
                onProgress: (progress) => {
                    outputLog.push(progress);
                    console.log(`Progress: ${progress}`);
                }
            });

            // Minimal validation - just check the operation completed
            console.log('Operation completed successfully');
            console.log(`Received ${outputLog.length} progress updates`);
        } catch (error) {
            // If we expect this operation to succeed, fail the test
            console.error('Operation failed:', error);
            throw error;
        }
    });
});
```

Place integration tests in the `__integration_tests__` directory to keep them separate from unit tests.
