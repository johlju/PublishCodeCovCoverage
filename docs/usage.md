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
| testResultFolderName | The path to the test result folder containing the code coverage report | Yes |
| coverageFileName | The name of the coverage file (e.g., 'coverage.xml'). If specified, argument -f will be used with this file. If not specified, argument -s will be used with the test result folder path. | No |
| networkRootFolder | Specify the root folder to help Codecov correctly map the file paths in the report to the repository structure. Sets the --network-root-folder argument when specified. | No |
| codecovToken | The token for uploading coverage to Codecov.io. If not provided, it will look for the CODECOV_TOKEN environment variable or pipeline variable. | No |
| verbose | Enable verbose output for the Codecov uploader | No |

The task can use the following environment variables or pipeline variables:

| Variable | Description | Required |
|-----------|-------------|----------|
| CODECOV_TOKEN | Your Codecov.io API token (required if not specified as input parameter) | Conditional |

## Examples

### Example 1: Using specific coverage file

```yaml
steps:
- task: PublishCodeCovCoverage@1
  displayName: 'Upload specific coverage file to Codecov.io'
  inputs:
    testResultFolderName: '$(Build.SourcesDirectory)/output/testResults'
    coverageFileName: 'output/testResults/JaCoCo_coverage.xml'
    verbose: true
  env:
    CODECOV_TOKEN: $(CODECOV_TOKEN)
```

### Example 2: Upload by directory (without specifying file)

```yaml
steps:
- task: PublishCodeCovCoverage@1
  displayName: 'Upload directory to Codecov.io'
  inputs:
    testResultFolderName: '$(Build.SourcesDirectory)/coverage'
    verbose: true
  env:
    CODECOV_TOKEN: $(CODECOV_TOKEN)
```

### Example 3: Using network root folder to fix path mapping issues

```yaml
steps:
- task: PublishCodeCovCoverage@1
  displayName: 'Upload to Codecov.io with path mapping'
  inputs:
    testResultFolderName: '$(Build.SourcesDirectory)/coverage'
    networkRootFolder: 'src'
    verbose: true
  env:
    CODECOV_TOKEN: $(CODECOV_TOKEN)
```

This example uses the `networkRootFolder` parameter to help Codecov.io correctly map file paths in the coverage report to your repository structure. This is particularly useful when you encounter "Unusable report due to source code unavailability" or "path mismatch" errors.

### Example 4: Upload by directory (without specifying file)

```yaml
steps:
- task: PublishCodeCovCoverage@1
  displayName: 'Upload all coverage from directory to Codecov.io'
  inputs:
    testResultFolderName: '$(Build.SourcesDirectory)/output/testResults'
  env:
    CODECOV_TOKEN: $(CODECOV_TOKEN)
```

### Example 5: Upload by directory (specifying file)

```yaml
steps:
- task: PublishCodeCovCoverage@1
  displayName: 'Upload all coverage from directory to Codecov.io'
  inputs:
    testResultFolderName: '$(Build.SourcesDirectory)/output/testResults'
    coverageFileName: 'JaCoCo_coverage.xml'
  env:
    CODECOV_TOKEN: $(CODECOV_TOKEN)
```

### Example 6: Using codecovToken input parameter instead of environment variable

```yaml
steps:
- task: PublishCodeCovCoverage@1
  displayName: 'Upload coverage to Codecov.io with token input'
  inputs:
    testResultFolderName: '$(Build.SourcesDirectory)/coverage'
    codecovToken: $(CODECOV_TOKEN)
```

In this example, the Codecov token is passed directly as an input parameter instead of as an environment variable. This provides an alternative way to supply the token when needed.

## How it works

The task performs the following steps:

1. Downloads the Codecov CLI from the official source.
2. Verifies the CLI using PGP keys and SHA256 checksums.
3. Uploads coverage to Codecov.io in one of two ways:
   - If `coverageFileName` is provided and exists, uses the `-f` parameter to upload the specific file
   - If `coverageFileName` is not provided, uses the `-s` parameter with `testResultFolderName` to upload all coverage from the directory

## Troubleshooting

If the task fails, check the following:

- Ensure the `CODECOV_TOKEN` environment variable is set correctly.
- Verify the coverage file exists at the specified path.
- Check if the coverage file is in a supported format (XML, JSON, etc.).

## Support

For issues with this task, please open an issue on the GitHub repository.
