# Custom Azure Pipeline Extension for Codecov.io

This repository contains a custom Azure Pipeline extension that handles code coverage uploads to Codecov.io. The extension can either use the Codecov API or the existing Codecov CLI to upload the coverage reports.

## Prerequisites

Before using this extension, ensure you have the following:

- An Azure DevOps account
- A Codecov.io account
- A Codecov token (CODECOV_TOKEN)

## Installation

1. Clone this repository to your local machine.
2. Navigate to the root directory of the repository.
3. Run the following command to install the necessary dependencies:

   ```sh
   npm install
   ```

4. Package the extension by running the following command:

   ```sh
   tfx extension create --manifest-globs vss-extension.json
   ```

5. Publish the extension to the Azure DevOps marketplace or your organization.

## Usage

To use the custom Azure Pipeline extension, follow these steps:

1. Add the extension to your Azure Pipeline YAML file.
2. Set the necessary environment variables (`CODECOV_TOKEN` and `CODECOV_URL`).

Here is an example of an Azure Pipeline YAML configuration:

```yaml
trigger:
- main

pool:
  vmImage: 'ubuntu-latest'

jobs:
- job: CodeCoverageUpload
  steps:
  - task: UseDotNet@2
    inputs:
      packageType: 'sdk'
      version: '5.x'
      installationPath: $(Agent.ToolsDirectory)/dotnet

  - task: CodeCoverageUploader@1
    inputs:
      buildFolderName: '$(Build.BinariesDirectory)'
      testResultFolderName: '$(Build.TestResultsDirectory)'
    env:
      CODECOV_TOKEN: $(CODECOV_TOKEN)
      CODECOV_URL: $(CODECOV_URL)
```

## Contributing

Contributions are welcome! If you find any issues or have suggestions for improvements, please open an issue or submit a pull request.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
