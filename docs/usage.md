# Codecov.io Coverage Uploader

This Azure DevOps pipeline task uploads code coverage reports to Codecov.io.

## Prerequisites

- An Azure DevOps account
- A Codecov.io account
- A Codecov token (CODECOV_TOKEN)

## Installation

1. Install this extension from the Visual Studio Marketplace or upload the .vsix file directly to your Azure DevOps organization.

2. In your Azure DevOps pipeline, add the Codecov.io Coverage Uploader task to your steps.

## Configuration

The task requires the following input parameters:

| Parameter | Description | Required |
|-----------|-------------|----------|
| buildFolderName | The path to the build folder containing the code coverage report | Yes |
| testResultFolderName | The path to the test result folder within the build folder | Yes |

The task also requires the following environment variables:

| Variable | Description | Required |
|-----------|-------------|----------|
| CODECOV_TOKEN | Your Codecov.io API token | Yes |
| CODECOV_URL | The Codecov.io URL (default: https://codecov.io) | No |

## Example

```yaml
steps:
- task: PublishCodeCovCoverage@1
  displayName: 'Upload code coverage to Codecov.io'
  inputs:
    buildFolderName: '$(Build.BinariesDirectory)'
    testResultFolderName: '$(Build.TestResultsDirectory)'
  env:
    CODECOV_TOKEN: $(CODECOV_TOKEN)
    CODECOV_URL: $(CODECOV_URL)
```

## How it works

The task performs the following steps:

1. Downloads the Codecov CLI from the official source.
2. Verifies the CLI using PGP keys and SHA256 checksums.
3. Executes the CLI to upload the coverage report to Codecov.io.

## Troubleshooting

If the task fails, check the following:

- Ensure the `CODECOV_TOKEN` environment variable is set correctly.
- Verify the coverage file exists at the specified path.
- Check if the coverage file is in a supported format (XML, JSON, etc.).

## Support

For issues with this task, please open an issue on the GitHub repository.
