import * as tl from 'azure-pipelines-task-lib/task';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import { execFileSync } from 'node:child_process';

// Variable to track if we set the CODECOV_TOKEN
let tokenWasSetByTask = false;

// Function to clear sensitive environment variables that were set by this task
function clearSensitiveEnvironmentVariables(): void {
    if (tokenWasSetByTask && process.env.CODECOV_TOKEN) {
        console.log('Removing CODECOV_TOKEN environment variable for security');
        // Using delete instead of setting to empty string ('') because:
        // 1. It completely removes the variable from process.env rather than leaving it with an empty value
        // 2. It's better for security to remove all traces of sensitive variables
        // 3. It resets the environment to its original state if the variable wasn't present before
        // 4. An empty string might still be processed differently than a non-existent variable by some APIs
        delete process.env.CODECOV_TOKEN;
    }
}

export async function run(): Promise<void> {
    try {
        // Set resource path for localization
        const taskJsonPath = path.join(__dirname, 'task.json');
        if (fs.existsSync(taskJsonPath)) {
            tl.setResourcePath(taskJsonPath);
        }

        // Get input parameters
        const testResultFolderName = tl.getInput('testResultFolderName', false) || '';
        const coverageFileName = tl.getInput('coverageFileName', false) || '';
        const networkRootFolder = tl.getInput('networkRootFolder', false) || '';
        const verbose = tl.getBoolInput('verbose', false) || false;
          // Get token from task input or pipeline variable, remove any whitespace
        const codecovTokenInput = (tl.getInput('codecovToken', false) || '').trim();
        const codecovTokenFromVariable = tl.getVariable('CODECOV_TOKEN');
        // If input token is empty, fallback to pipeline variable
        const codecovToken = codecovTokenInput !== '' ? codecovTokenInput : codecovTokenFromVariable;

        // Log token source for debugging
        if (codecovTokenInput !== '') {
            console.log('Using Codecov token from task input parameter');
        } else if (codecovTokenFromVariable) {
            console.log('Using Codecov token from pipeline variable');
        } else if (process.env.CODECOV_TOKEN) {
            console.log('Using Codecov token from pre-existing environment variable');
        }

        // If value provided as input or pipeline variable, override process.env.CODECOV_TOKEN
        if (codecovToken) {
            const existingToken = process.env.CODECOV_TOKEN;

            if (!existingToken) {
                process.env.CODECOV_TOKEN = codecovToken;
                tokenWasSetByTask = true;
                console.log('Environment variable CODECOV_TOKEN has been set');
            } else if (existingToken !== codecovToken) {
                process.env.CODECOV_TOKEN = codecovToken;
                tokenWasSetByTask = true;
                console.log('Environment variable CODECOV_TOKEN has been overridden with new value');
            } else {
                console.log('Environment variable CODECOV_TOKEN already has the correct value, not changing');
            }
        } else if(!process.env.CODECOV_TOKEN) {
            throw new Error('CODECOV_TOKEN environment variable is not set or passed as input or pipeline variable');
        }

        console.log('Uploading code coverage to Codecov.io');
        console.log(`Test result folder: ${testResultFolderName || 'not specified'}`);
        if (coverageFileName) {
            console.log(`Coverage file name: ${coverageFileName}${!testResultFolderName ? ' (using as full path)' : ''}`);
        } else {
            console.log(`Coverage file name: not specified - will use test result folder`);
        }
        if (networkRootFolder) {
            console.log(`Network root folder: ${networkRootFolder}`);
        }
        console.log(`Verbose mode: ${verbose ? 'enabled' : 'disabled'}`);

        // Save the original working directory to resolve relative paths later
        const originalWorkingDir = process.cwd();
        console.log(`Original working directory: ${originalWorkingDir}`);

        // URLs for the Codecov CLI
        const cliUrl = 'https://cli.codecov.io/latest/linux/codecov';
        const sha256sumUrl = 'https://cli.codecov.io/latest/linux/codecov.SHA256SUM';
        const sha256sumSigUrl = 'https://cli.codecov.io/latest/linux/codecov.SHA256SUM.sig';
        const pgpKeysUrl = 'https://keybase.io/codecovsecurity/pgp_keys.asc';

        // Create a directory to store files
        const tempDir = tl.getVariable('Agent.TempDirectory') || '.';
        const workingDir = path.join(tempDir, 'codecov_uploader');

        if (!fs.existsSync(workingDir)) {
            fs.mkdirSync(workingDir, { recursive: true });
        }

        // Change to working directory
        process.chdir(workingDir);
        console.log(`Working directory: ${workingDir}`);

        // Download necessary files
        console.log('Downloading PGP keys...');
        await downloadFile(pgpKeysUrl, 'pgp_keys.asc');
        console.log('Importing PGP keys...');
        execFileSync('gpg', ['--no-default-keyring', '--import', 'pgp_keys.asc'], { stdio: 'inherit' });

        console.log('Downloading Codecov CLI...');
        await downloadFile(cliUrl, 'codecov');
        await downloadFile(sha256sumUrl, 'codecov.SHA256SUM');
        await downloadFile(sha256sumSigUrl, 'codecov.SHA256SUM.sig');

        console.log('Verifying Codecov CLI...');
        execFileSync('gpg', ['--verify', 'codecov.SHA256SUM.sig', 'codecov.SHA256SUM'], { stdio: 'inherit' });
        execFileSync('shasum', ['-a', '256', '-c', 'codecov.SHA256SUM'], { stdio: 'inherit' });
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
                throw new Error(`Specified test result folder not found at ${resolvedTestResultFolderPath}`);
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
            console.log(`Uploading specific coverage file: ${actualCoverageFilePath}`);
            args.push('-f', actualCoverageFilePath);
        }
        // Otherwise use -s with the testResultFolderName directory if it's specified
        else if (testResultFolderName) {
            console.log(`Uploading from directory: ${resolvedTestResultFolderPath}`);
            args.push('-s', resolvedTestResultFolderPath);
        }
        else {
            throw new Error('Either coverageFileName or testResultFolderName must be specified');
        }

        // Add network root folder if specified
        if (networkRootFolder) {
            // Resolve network root folder path relative to the original working directory if it's a relative path
            const resolvedNetworkRootFolder = path.isAbsolute(networkRootFolder)
                ? networkRootFolder
                : path.resolve(originalWorkingDir, networkRootFolder);

            console.log(`Adding network root folder: ${resolvedNetworkRootFolder}`);
            args.push('--network-root-folder', resolvedNetworkRootFolder);
        }

        // Log the command and arguments with proper quoting and escaping for readability
        console.log(`Executing command: ./codecov ${args.map(arg => quoteCommandArgument(arg)).join(' ')}`);
        execFileSync('./codecov', args, {
            stdio: 'inherit'
        });

        console.log('Upload completed successfully');

        // Clear sensitive environment variables before exiting
        clearSensitiveEnvironmentVariables();

        tl.setResult(tl.TaskResult.Succeeded, 'Code coverage uploaded successfully');

    } catch (err: any) {
        console.error(`Error: ${err.message}`);
        if (err.stdout) console.log(`stdout: ${err.stdout}`);
        if (err.stderr) console.error(`stderr: ${err.stderr}`);

        // Clear sensitive environment variables even on error
        clearSensitiveEnvironmentVariables();

        tl.setResult(tl.TaskResult.Failed, err.message);
    }
}

export async function downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
        console.log(`Downloading ${url} to ${dest}`);
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                return reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
            }

            response.pipe(file);

            file.on('finish', () => {
                file.close(() => {
                    console.log(`Downloaded ${url} successfully`);
                    resolve();
                });
            });

            file.on('error', (err) => {
                fs.unlink(dest, () => reject(err));
            });

        }).on('error', (err) => {
            fs.unlink(dest, () => reject(err));
        });
    });
}

/**
 * Helper function to properly quote a command line argument
 * Escapes quotes and backslashes, then wraps the string in quotes
 * @param arg The argument to quote
 * @returns The quoted argument
 */
function quoteCommandArgument(arg: string): string {
    // Escape backslashes and quotes
    const escaped = arg.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    // Wrap in quotes
    return `"${escaped}"`;
}

// Define the error handler for unhandled rejections
function handleUnhandledError(err: Error): void {
    console.error('Unhandled error:', err);
    // Clear sensitive environment variables on unhandled errors
    clearSensitiveEnvironmentVariables();
    tl.setResult(tl.TaskResult.Failed, `Unhandled error: ${err.message}`);
}

// Execute the task
run().catch(handleUnhandledError);

// Expose the handler and variables for testing purposes as named exports
// This conditional prevents them from being included in production builds
export const __runCatchHandlerForTest = process.env.NODE_ENV === 'test' ? handleUnhandledError : undefined;
export const setTokenWasSetByTaskForTest = process.env.NODE_ENV === 'test' ?
    (value: boolean): void => {
        tokenWasSetByTask = value;
    } : undefined;
