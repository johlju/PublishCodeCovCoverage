#!/bin/bash
# Build and package the Azure DevOps extension

# Install dependencies if not already installed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

# Run tests
echo "Running tests..."
npm run test:all

# Compile TypeScript
echo "Compiling TypeScript..."
npm run build

# Create extension directory structure
echo "Creating extension structure..."
mkdir -p dist/PublishCodeCovCoverageTask
cp src/PublishCodeCovCoverageTask/task.json dist/PublishCodeCovCoverageTask/
cp -r images dist/

# Package the extension
echo "Packaging extension..."
npx tfx extension create --manifest-globs vss-extension.json --output-path dist

echo "Extension packaging complete!"
