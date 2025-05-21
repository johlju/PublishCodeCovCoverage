import * as tl from 'azure-pipelines-task-lib/task';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { verifyFileChecksum } from './utils/fileUtils';
import { quoteCommandArgument } from './utils/commandUtils';
import { clearSensitiveEnvironmentVariables, setTokenWasSetByTask } from './utils/environmentUtils';
import { downloadFile } from './utils/webUtils';
import { handleUnhandledError } from './utils/errorUtils';
import logger from './utils/logger';

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
      logger.info('Using Codecov token from task input parameter');
    } else if (codecovTokenFromVariable) {
      logger.info('Using Codecov token from pipeline variable');
    } else if (process.env.CODECOV_TOKEN) {
      logger.info('Using Codecov token from pre-existing environment variable');
    }

    // If value provided as input or pipeline variable, override process.env.CODECOV_TOKEN
    if (codecovToken) {
      const existingToken = process.env.CODECOV_TOKEN;

      if (!existingToken) {
        process.env.CODECOV_TOKEN = codecovToken;
        setTokenWasSetByTask(true);
        logger.info('Environment variable CODECOV_TOKEN has been set');
      } else if (existingToken !== codecovToken) {
        process.env.CODECOV_TOKEN = codecovToken;
        setTokenWasSetByTask(true);
        logger.info('Environment variable CODECOV_TOKEN has been overridden with new value');
      } else {
        logger.info(
          'Environment variable CODECOV_TOKEN already has the correct value, not changing'
        );
      }
    } else if (!process.env.CODECOV_TOKEN) {
      throw new Error(
        'CODECOV_TOKEN environment variable is not set or passed as input or pipeline variable'
      );
    }

    logger.info('Uploading code coverage to Codecov.io');
    logger.info(`Test result folder: ${testResultFolderName || 'not specified'}`);
    if (coverageFileName) {
      logger.info(
        `Coverage file name: ${coverageFileName}${!testResultFolderName ? ' (using as full path)' : ''}`
      );
    } else {
      logger.info(`Coverage file name: not specified - will use test result folder`);
    }
    if (networkRootFolder) {
      logger.info(`Network root folder: ${networkRootFolder}`);
    }
    logger.info(`Verbose mode: ${verbose ? 'enabled' : 'disabled'}`);

    // Save the original working directory to resolve relative paths later
    const originalWorkingDir = process.cwd();
    logger.debug(`Original working directory: ${originalWorkingDir}`);

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
    logger.info(`Working directory: ${workingDir}`);

    // Download necessary files
    logger.info('Downloading PGP keys...');
    await downloadFile(pgpKeysUrl, 'pgp_keys.asc');
    logger.info('Importing PGP keys...');
    execFileSync('gpg', ['--no-default-keyring', '--import', 'pgp_keys.asc'], { stdio: 'inherit' });

    logger.info('Downloading Codecov CLI...');
    await downloadFile(cliUrl, 'codecov');
    await downloadFile(sha256sumUrl, 'codecov.SHA256SUM');
    await downloadFile(sha256sumSigUrl, 'codecov.SHA256SUM.sig');

    logger.info('Verifying Codecov CLI...');
    execFileSync('gpg', ['--verify', 'codecov.SHA256SUM.sig', 'codecov.SHA256SUM'], {
      stdio: 'inherit',
    });
    await verifyFileChecksum('codecov', 'codecov.SHA256SUM', logger.info.bind(logger));
    fs.chmodSync('codecov', '755');
    // Prepare coverage file or directory
    let resolvedTestResultFolderPath: string | undefined;
    let actualCoverageFilePath: string | undefined;
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
      if (actualCoverageFilePath) {
        logger.info(`Uploading specific coverage file: ${actualCoverageFilePath}`);
        args.push('-f', actualCoverageFilePath);
        args.push('--disable-search');
      }
    }
    // Otherwise use -s with the testResultFolderName directory if it's specified
    else if (testResultFolderName) {
      if (resolvedTestResultFolderPath) {
        logger.info(`Uploading from directory: ${resolvedTestResultFolderPath}`);
        args.push('-s', resolvedTestResultFolderPath);
      }
    } else {
      throw new Error('Either coverageFileName or testResultFolderName must be specified');
    }

    // Add network root folder if specified
    if (networkRootFolder) {
      // Resolve network root folder path relative to the original working directory if it's a relative path
      const resolvedNetworkRootFolder = path.isAbsolute(networkRootFolder)
        ? networkRootFolder
        : path.resolve(originalWorkingDir, networkRootFolder);
      logger.info(`Adding network root folder: ${resolvedNetworkRootFolder}`);
      args.push('--network-root-folder', resolvedNetworkRootFolder);
    }
    logger.debug(
      `Executing command: ./codecov ${args.map((arg) => quoteCommandArgument(arg)).join(' ')}`
    );
    execFileSync('./codecov', args, {
      stdio: 'inherit',
    });
    logger.info('Upload completed successfully');

    // Clear sensitive environment variables before exiting
    clearSensitiveEnvironmentVariables();

    tl.setResult(tl.TaskResult.Succeeded, 'Code coverage uploaded successfully');
  } catch (err: unknown) {
    const error = err as Error & { stdout?: string; stderr?: string; message: string };
    logger.error(`Error: ${error.message}`);
    if (error.stdout) {
      logger.info(`stdout: ${error.stdout}`);
    }
    if (error.stderr) {
      logger.error(`stderr: ${error.stderr}`);
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
