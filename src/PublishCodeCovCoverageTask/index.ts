import * as tl from 'azure-pipelines-task-lib/task';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import { execSync } from 'child_process';

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

        // Get token from task input or pipeline variable
        const codecovTokenInput = tl.getInput('codecovToken', false);
        const codecovToken = codecovTokenInput || tl.getVariable('CODECOV_TOKEN');

        // If value provided as input or pipeline variable, override process.env.CODECOV_TOKEN
        if (codecovToken) {
            process.env.CODECOV_TOKEN = codecovToken;

            console.log('Environment variable CODECOV_TOKEN has been set');
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

        if (!codecovToken) {
            throw new Error('CODECOV_TOKEN environment variable is not set');
        }

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
        execSync('gpg --no-default-keyring --import pgp_keys.asc', { stdio: 'inherit' });

        console.log('Downloading Codecov CLI...');
        await downloadFile(cliUrl, 'codecov');
        await downloadFile(sha256sumUrl, 'codecov.SHA256SUM');
        await downloadFile(sha256sumSigUrl, 'codecov.SHA256SUM.sig');

        console.log('Verifying Codecov CLI...');
        execSync('gpg --verify codecov.SHA256SUM.sig codecov.SHA256SUM', { stdio: 'inherit' });
        execSync('shasum -a 256 -c codecov.SHA256SUM', { stdio: 'inherit' });
        fs.chmodSync('codecov', '755');

        // Check if coverage file exists
        let actualCoverageFilePath = '';

        if (coverageFileName) {
            // If testResultFolderName is provided, join it with coverageFileName
            // Otherwise, treat coverageFileName as a full path
            if (testResultFolderName) {
                actualCoverageFilePath = path.join(testResultFolderName, coverageFileName);
            } else {
                actualCoverageFilePath = coverageFileName;
            }

            if (!fs.existsSync(actualCoverageFilePath)) {
                throw new Error(`Specified coverage file not found at ${actualCoverageFilePath}`);
            }
        }
        const verboseFlag = verbose ? ' --verbose' : '';
        let uploadCommand = `./codecov${verboseFlag} upload-process`;

        // If coverageFileName was provided, use -f with the file path
        if (coverageFileName) {
            console.log(`Uploading specific coverage file: ${actualCoverageFilePath}`);
            uploadCommand += ` -f "${actualCoverageFilePath}"`;
        }
        // Otherwise use -s with the testResultFolderName directory if it's specified
        else if (testResultFolderName) {
            console.log(`Uploading from directory: ${testResultFolderName}`);
            uploadCommand += ` -s "${testResultFolderName}"`;
        }
        else {
            throw new Error('Either coverageFileName or testResultFolderName must be specified');
        }

        // Add network root folder if specified
        if (networkRootFolder) {
            console.log(`Adding network root folder: ${networkRootFolder}`);
            uploadCommand += ` --network-root-folder "${networkRootFolder}"`;
        }

        // Log the command with redacted token
        console.log(`Executing command: ${uploadCommand}`);
        execSync(uploadCommand, {
            stdio: 'inherit'
        });

        console.log('Upload completed successfully');

        tl.setResult(tl.TaskResult.Succeeded, 'Code coverage uploaded successfully');

    } catch (err: any) {
        console.error(`Error: ${err.message}`);
        if (err.stdout) console.log(`stdout: ${err.stdout}`);
        if (err.stderr) console.error(`stderr: ${err.stderr}`);
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

// Define the error handler for unhandled rejections
function handleUnhandledError(err: Error): void {
    console.error('Unhandled error:', err);
    tl.setResult(tl.TaskResult.Failed, `Unhandled error: ${err.message}`);
}

// Execute the task
run().catch(handleUnhandledError);

// Expose the handler for testing purposes
// This conditional prevents it from affecting the actual behavior
if (process.env.NODE_ENV === 'test') {
    module.exports.__runCatchHandlerForTest = handleUnhandledError;
}
