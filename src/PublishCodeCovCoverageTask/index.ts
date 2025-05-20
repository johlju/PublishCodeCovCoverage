import * as tl from 'azure-pipelines-task-lib/task';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { verifyFileChecksum } from './utils/fileUtils';
import { quoteCommandArgument } from './utils/commandUtils';
import { clearSensitiveEnvironmentVariables, setTokenWasSetByTask } from './utils/environmentUtils';
import { downloadFile } from './utils/webUtils';
import { handleUnhandledError } from './utils/errorUtils';

export async function run(): Promise<void> {
  try {
    // Set resource path for localization
    const taskJsonPath = path.join(__dirname, 'task.json');
    if (fs.existsSync(taskJsonPath)) {
      tl.setResourcePath(taskJsonPath);
    }

    // Get input parameters
    const testResultFolderName = tl.getInput('testResultFolderName', false) ?? '';
    const coverageFileName = tl.getInput('coverageFileName', false) ?? '';
    const networkRootFolder = tl.getInput('networkRootFolder', false) ?? '';
    const verbose = tl.getBoolInput('verbose', false) ?? false;
    // Get token from task input or pipeline variable, remove any whitespace
    const codecovTokenInput = (tl.getInput('codecovToken', false) ?? '').trim();
    const codecovTokenFromVariable = tl.getVariable('CODECOV_TOKEN');
    // If input token is empty, fallback to pipeline variable
    const codecovToken = codecovTokenInput !== '' ? codecovTokenInput : codecovTokenFromVariable;

    // Log token source for debugging
    if (codecovTokenInput !== '') {
      // eslint-disable-next-line no-console
      console.log('Using Codecov token from task input parameter');
    } else if (codecovTokenFromVariable) {
      // eslint-disable-next-line no-console
      console.log('Using Codecov token from pipeline variable');
    } else if (process.env.CODECOV_TOKEN) {
      // eslint-disable-next-line no-console
      console.log('Using Codecov token from pre-existing environment variable');
    }

    // If value provided as input or pipeline variable, override process.env.CODECOV_TOKEN
    if (codecovToken) {
      const existingToken = process.env.CODECOV_TOKEN;

      if (!existingToken) {
        process.env.CODECOV_TOKEN = codecovToken;
        setTokenWasSetByTask(true);
        // eslint-disable-next-line no-console
        console.log('Environment variable CODECOV_TOKEN has been set');
      } else if (existingToken !== codecovToken) {
        process.env.CODECOV_TOKEN = codecovToken;
        setTokenWasSetByTask(true);
        // eslint-disable-next-line no-console
        console.log('Environment variable CODECOV_TOKEN has been overridden with new value');
      } else {
        // eslint-disable-next-line no-console
        console.log(
          'Environment variable CODECOV_TOKEN already has the correct value, not changing'
        );
      }
    } else if (!process.env.CODECOV_TOKEN) {
      throw new Error(
        'CODECOV_TOKEN environment variable is not set or passed as input or pipeline variable'
      );
    }

    // eslint-disable-next-line no-console
    console.log('Uploading code coverage to Codecov.io');
    // eslint-disable-next-line no-console
    console.log(`Test result folder: ${testResultFolderName || 'not specified'}`);
    if (coverageFileName) {
      // eslint-disable-next-line no-console
      console.log(
        `Coverage file name: ${coverageFileName}${!testResultFolderName ? ' (using as full path)' : ''}`
      );
    } else {
      // eslint-disable-next-line no-console
      console.log(`Coverage file name: not specified - will use test result folder`);
    }
    if (networkRootFolder) {
      // eslint-disable-next-line no-console
      console.log(`Network root folder: ${networkRootFolder}`);
    }
    // eslint-disable-next-line no-console
    console.log(`Verbose mode: ${verbose ? 'enabled' : 'disabled'}`);

    // Save the original working directory to resolve relative paths later
    const originalWorkingDir = process.cwd();
    // eslint-disable-next-line no-console
    console.log(`Original working directory: ${originalWorkingDir}`);

    // URLs for the Codecov CLI
    const cliUrl = 'https://cli.codecov.io/latest/linux/codecov';
    const sha256sumUrl = 'https://cli.codecov.io/latest/linux/codecov.SHA256SUM';
    const sha256sumSigUrl = 'https://cli.codecov.io/latest/linux/codecov.SHA256SUM.sig';
    const pgpKeysUrl = 'https://keybase.io/codecovsecurity/pgp_keys.asc';

    // Create a directory to store files
    const tempDir = tl.getVariable('Agent.TempDirectory') ?? '.';
    const workingDir = path.join(tempDir, 'codecov_uploader');

    if (!fs.existsSync(workingDir)) {
      fs.mkdirSync(workingDir, { recursive: true });
    }

    // Change to working directory
    process.chdir(workingDir);
    // eslint-disable-next-line no-console
    console.log(`Working directory: ${workingDir}`);

    // Download necessary files
    // eslint-disable-next-line no-console
    console.log('Downloading PGP keys...');
    await downloadFile(pgpKeysUrl, 'pgp_keys.asc');
    // eslint-disable-next-line no-console
    console.log('Importing PGP keys...');
    execFileSync('gpg', ['--no-default-keyring', '--import', 'pgp_keys.asc'], { stdio: 'inherit' });

    // eslint-disable-next-line no-console
    console.log('Downloading Codecov CLI...');
    await downloadFile(cliUrl, 'codecov');
    await downloadFile(sha256sumUrl, 'codecov.SHA256SUM');
    await downloadFile(sha256sumSigUrl, 'codecov.SHA256SUM.sig');

    // eslint-disable-next-line no-console
    console.log('Verifying Codecov CLI...');
    execFileSync('gpg', ['--verify', 'codecov.SHA256SUM.sig', 'codecov.SHA256SUM'], {
      stdio: 'inherit',
    });
    await verifyFileChecksum('codecov', 'codecov.SHA256SUM', console.log);
    fs.chmodSync('codecov', '755');

    // Check if coverage file exists
    let actualCoverageFilePath = '';
    let resolvedTestResultFolderPath = '';

    if (coverageFileName) {
      // If testResultFolderName is provided, join it with coverageFileName
      // Otherwise, treat coverageFileName as a full path
      if (testResultFolderName) {
        // Resolve paths relative to the original working directory
        resolvedTestResultFolderPath = path.resolve(originalWorkingDir, testResultFolderName);
        actualCoverageFilePath = path.join(resolvedTestResultFolderPath, coverageFileName);
      } else {
        // Resolve path relative to the original working directory
        actualCoverageFilePath = path.resolve(originalWorkingDir, coverageFileName);
      }

      if (!fs.existsSync(actualCoverageFilePath)) {
        throw new Error(`Specified coverage file not found at ${actualCoverageFilePath}`);
      }
    } else if (testResultFolderName) {
      // Resolve test result folder path relative to the original working directory
      resolvedTestResultFolderPath = path.resolve(originalWorkingDir, testResultFolderName);

      if (!fs.existsSync(resolvedTestResultFolderPath)) {
        throw new Error(
          `Specified test result folder not found at ${resolvedTestResultFolderPath}`
        );
      }
    }
    // Build an array of arguments for execFileSync
    const args: string[] = [];

    // Add verbose flag if needed (must come before the command)
    if (verbose) {
      args.push('--verbose');
    }

    // Add the command after any global options
    args.push('upload-process');

    // If coverageFileName was provided, use -f with the file path
    if (coverageFileName) {
      // eslint-disable-next-line no-console
      console.log(`Uploading specific coverage file: ${actualCoverageFilePath}`);
      args.push('-f', actualCoverageFilePath);
    }
    // Otherwise use -s with the testResultFolderName directory if it's specified
    else if (testResultFolderName) {
      // eslint-disable-next-line no-console
      console.log(`Uploading from directory: ${resolvedTestResultFolderPath}`);
      args.push('-s', resolvedTestResultFolderPath);
    } else {
      throw new Error('Either coverageFileName or testResultFolderName must be specified');
    }

    // Add network root folder if specified
    if (networkRootFolder) {
      // Resolve network root folder path relative to the original working directory if it's a relative path
      const resolvedNetworkRootFolder = path.isAbsolute(networkRootFolder)
        ? networkRootFolder
        : path.resolve(originalWorkingDir, networkRootFolder);

      // eslint-disable-next-line no-console
      console.log(`Adding network root folder: ${resolvedNetworkRootFolder}`);
      args.push('--network-root-folder', resolvedNetworkRootFolder);
    }

    // Log the command and arguments with proper quoting and escaping for readability
    // eslint-disable-next-line no-console
    console.log(
      `Executing command: ./codecov ${args.map((arg) => quoteCommandArgument(arg)).join(' ')}`
    );
    execFileSync('./codecov', args, {
      stdio: 'inherit',
    });

    // eslint-disable-next-line no-console
    console.log('Upload completed successfully');

    // Clear sensitive environment variables before exiting
    clearSensitiveEnvironmentVariables();

    tl.setResult(tl.TaskResult.Succeeded, 'Code coverage uploaded successfully');
  } catch (err: unknown) {
    const error = err as Error & { stdout?: string; stderr?: string; message: string };
    // eslint-disable-next-line no-console
    console.error(`Error: ${error.message}`);
    if (error.stdout) {
      // eslint-disable-next-line no-console
      console.log(`stdout: ${error.stdout}`);
    }
    if (error.stderr) {
      // eslint-disable-next-line no-console
      console.error(`stderr: ${error.stderr}`);
    }

    // Clear sensitive environment variables even on error
    clearSensitiveEnvironmentVariables();

    tl.setResult(tl.TaskResult.Failed, error.message);
  }
}

// Execute the task
run().catch(handleUnhandledError);

/**
 * Exposes the unhandled error handler for unit testing purposes.
 * This export is only enabled when NODE_ENV is set to 'test'.
 * When used in production builds, this will be undefined.
 */
export const __runCatchHandlerForTest =
  process.env.NODE_ENV === 'test' ? handleUnhandledError : undefined;
