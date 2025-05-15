# Custom Azure Pipeline Extension for Codecov.io

This repository contains a custom Azure Pipeline extension that handles code coverage uploads to Codecov.io. The extension uses the official Codecov CLI to securely upload coverage reports.

## Prerequisites

Before using this extension, ensure you have the following:

- An Azure DevOps account
- A Codecov.io account
- A Codecov token (CODECOV_TOKEN)
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
   npm run test
   ```

5. Build and package the extension by running:

   ```sh
   npm run package
   ```

   Note: This will automatically run the tests before packaging.

6. The packaged extension (.vsix) will be available in the `dist` directory.
7. Upload this extension to your Azure DevOps organization or publish it to the marketplace.

## Usage

To use the custom Azure Pipeline extension, follow these steps:

1. Add the extension to your Azure Pipeline YAML file.
2. Set the necessary environment variables `CODECOV_TOKEN`.
3. Configure the task with the proper build and test result folder paths.

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
  - task: PublishCodeCovCoverage@1
    displayName: 'Upload code coverage to Codecov.io'
    inputs:
      buildFolderName: '$(Build.BinariesDirectory)'
      testResultFolderName: '$(Build.TestResultsDirectory)'
    env:
      CODECOV_TOKEN: $(CODECOV_TOKEN)
```

For detailed usage instructions, please see the [usage documentation](docs/usage.md).

## Contributing

Contributions are welcome! If you find any issues or have suggestions for improvements, please open an issue or submit a pull request.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
