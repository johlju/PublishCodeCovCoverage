# Custom Azure Pipeline Extension for Codecov.io

[![Build Status](https://dev.azure.com/viscalyx/PublishCodeCovCoverage/_apis/build/status/PublishCodeCovCoverage?branchName=main)](https://dev.azure.com/viscalyx/PublishCodeCovCoverage/_build/latest?definitionId=1&branchName=main)
[![codecov](https://codecov.io/gh/viscalyx/PublishCodeCovCoverage/branch/main/graph/badge.svg)](https://codecov.io/gh/viscalyx/PublishCodeCovCoverage)
[![GitHub License](https://img.shields.io/github/license/viscalyx/PublishCodeCovCoverage)](https://github.com/viscalyx/PublishCodeCovCoverage/blob/main/LICENSE)

> [!NOTE]
> This is an unofficial Azure Pipeline task not affiliated with Codecov.io. It uses the official Codecov CLI from Codecov.io to upload coverage reports.

This repository contains a custom Azure Pipeline extension that handles code coverage uploads to Codecov.io.

## Prerequisites

Before using this extension, ensure you have the following:

- An Azure DevOps account
- A Codecov.io account
- A Codecov token from Codecov.io
- Azure DevOps agent running Linux (Ubuntu/Debian recommended)
- Windows and macOS agents are not currently supported as the task uses Linux-specific CLI tools
- Node.js 20 or later

## Installation

### For Users

1. Download the latest `.vsix` file from the releases page.
2. Upload the extension to your Azure DevOps organization through the Manage Extensions page.
3. Add the task to your pipeline as described in the Usage section.

### For Developers

1. Clone this repository to your local machine.
2. Navigate to the root directory of the repository.
3. Run the following command to install the necessary dependencies:

   ```sh
   npm install
   ```

4. Run the tests to ensure everything is working:

   ```sh
   npm run test         # Run unit tests only
   npm run test:integration # Run integration tests only
   npm run test:all     # Run both unit and integration tests
   ```

   For more details about testing, refer to the [Testing Documentation](docs/testing.md).

5. Lint your code to ensure it meets the project's coding standards:

   ```sh
   npm run lint         # Check for linting issues
   npm run lint:fix     # Automatically fix linting issues when possible
   ```

   For more details about the ESLint setup, refer to the [ESLint Documentation](docs/eslint.md).

6. Build and package the extension by running:

   ```sh
   npm run package
   ```

   Note: This will automatically run the tests before packaging.

7. The packaged extension (.vsix) will be available in the `dist` directory.
8. Upload this extension to your Azure DevOps organization or publish it to the marketplace.

## Usage

To use the custom Azure Pipeline extension, follow these steps:

1. Add the extension to your Azure Pipeline YAML file.
2. Provide your Codecov token either as an environment variable `CODECOV_TOKEN` or as an input parameter `codecovToken`.
3. Configure the task with the proper build and test result folder paths.

>[!IMPORTANT]: Mark CODECOV_TOKEN as a secret to avoid log exposure. Note that secret pipeline variables are not exposed to pull requests from forks.

Here is an example of an Azure Pipeline YAML configuration:

```yaml
trigger:
- main

pool:
  vmImage: 'ubuntu-latest'

jobs:
- job: PublishCodeCovCoverage
  steps:
  - task: UseDotNet@2
    inputs:
      packageType: 'sdk'
      version: '5.x'
      installationPath: $(Agent.ToolsDirectory)/dotnet

  # Run your build and tests here
  # ...

  # Method 1: Using environment variables (traditional approach)
  - task: PublishCodeCovCoverage@1
    displayName: 'Upload code coverage with env variable'
    inputs:
      testResultFolderName: '$(Build.TestResultsDirectory)'
    env:
      CODECOV_TOKEN: 'YOUR_CODECOV_TOKEN_HERE'

  # Method 2: Using input parameter (new approach)
  - task: PublishCodeCovCoverage@1
    displayName: 'Upload code coverage with input parameter'
    inputs:
      testResultFolderName: '$(Build.TestResultsDirectory)'
      codecovToken: 'YOUR_CODECOV_TOKEN_HERE'
```

For detailed usage instructions, please see the [usage documentation](docs/usage.md).

## Task Inputs and Advanced Options

The following inputs are supported by the task. All are optional unless otherwise noted. These map directly to Codecov CLI arguments:

| Input Name                        | Type     | Description |
|------------------------------------|----------|-------------|
| testResultFolderName (required)    | string   | The name of the test result folder containing the code coverage report. |
| coverageFileName                   | string   | The name of the coverage file (e.g., 'coverage.xml'). If specified, only this file is uploaded. |
| networkRootFolder                  | string   | Specify the root folder to help Codecov correctly map the file paths in the report to the repository structure. |
| codecovToken                       | string   | The token for uploading coverage to Codecov.io. If not provided, it will look for the CODECOV_TOKEN environment variable. |
| verbose                            | boolean  | Enable verbose output for the Codecov uploader. |
| coverageFilesSearchExcludeFolder    | string   | Folders to exclude from coverage file search. Passed as --coverage-files-search-exclude-folder. |
| recurseSubmodules                  | boolean  | Whether to enumerate files inside submodules for path-fixing purposes. Passed as --recurse-submodules. |
| buildUrl                           | string   | The URL of the build where this is running. Passed as --build-url. |
| jobCode                            | string   | The job code for the CI run. Passed as --job-code. |
| name                               | string   | Custom defined name of the upload. Visible in Codecov UI. Passed as --name. |
| plugin                             | string   | Plugins to run (xcode, gcov, pycoverage). Passed as --plugin. |
| failOnError                        | boolean  | Exit with non-zero code in case of error uploading. Passed as --fail-on-error. |
| dryRun                             | boolean  | Don't upload files to Codecov (dry run). Passed as --dry-run. |
| useLegacyUploader                  | boolean  | Use the legacy upload endpoint. Passed as --use-legacy-uploader. |
| envVar                             | string   | Specify environment variables to be included with this build. Passed as --env-var. |
| flag                               | string   | Flag the upload to group coverage metrics. Multiple flags allowed. Passed as --flag. |
| branch                             | string   | Branch to which this commit belongs to. Passed as --branch. |
| pullRequestNumber                  | string   | Specify the pull request number manually. Passed as --pull-request-number. |

You can set these inputs in your YAML pipeline under the `inputs:` section of the task. For example:

```yaml
- task: PublishCodeCovCoverage@1
  displayName: 'Upload code coverage with advanced options'
  inputs:
    testResultFolderName: '$(Build.TestResultsDirectory)'
    codecovToken: '$(CODECOV_TOKEN)'
    verbose: true
    coverageFilesSearchExcludeFolder: 'node_modules,dist'
    recurseSubmodules: true
    buildUrl: '$(Build.BuildUri)'
    jobCode: '$(Build.BuildId)'
    name: 'My Custom Upload'
    plugin: 'gcov'
    failOnError: true
    dryRun: false
    useLegacyUploader: false
    envVar: 'MY_ENV_VAR=1'
    flag: 'unittest'
    branch: 'main'
    pullRequestNumber: '123'
```

For more details on each option, see the [Codecov CLI documentation](https://github.com/codecov/codecov-cli#codecov-cli-commands).

## Testing Guidelines

This project enforces strict code quality standards including proper TypeScript typing for all Jest mocks.

### Typed Mocks Best Practices

We've adopted strict typing for all mocks in our test files to ensure type safety and better maintainability:

```typescript
// GOOD: Properly typed mocks
let mockAxios: jest.MockedFunction<typeof axios>;

// BAD: Avoid untyped mocks
let mockAxios: any;
```

For axios mocks specifically:

```typescript
// GOOD: Use mockResolvedValueOnce for clearer promise handling
mockAxios.mockResolvedValueOnce({ status: 200, data: responseData });

// BAD: Don't use untyped casting
(axios as any).mockImplementationOnce(() => {
  return Promise.resolve({ status: 200, data: responseData });
});
```

For more details on our mocking standards:

- See the [Testing Best Practices](docs/testing-best-practices.md) guide
- Review example implementation in [webUtils.test.ts](src/PublishCodeCovCoverageTask/__tests__/webUtils.test.ts)

All new contributions must follow these patterns.

## Contributing

Contributions are welcome! If you find any issues or have suggestions for improvements, please open an issue or submit a pull request.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
