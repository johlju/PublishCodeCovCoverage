#!/bin/bash
# Package the Azure DevOps extension

# Create extension directory structure
echo "Creating extension structure..."
mkdir -p dist/PublishCodeCovCoverageTask
cp src/PublishCodeCovCoverageTask/task.json dist/PublishCodeCovCoverageTask/
cp -r images dist/

# Package the extension
echo "Packaging extension..."
npx tfx extension create --manifest-globs vss-extension.json --output-path dist

echo "Extension packaging complete!"
