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
        const testResultFolderName = tl.getInput('testResultFolderName', true) || '';
        const coverageFileName = tl.getInput('coverageFileName', false) || '';
        const verbose = tl.getBoolInput('verbose', false) || false;

        // Get environment variables
        const codecovToken = tl.getVariable('CODECOV_TOKEN') || process.env.CODECOV_TOKEN;

        console.log('Uploading code coverage to Codecov.io');
        console.log(`Test result folder: ${testResultFolderName}`);
        console.log(`Coverage file name: ${coverageFileName || 'not specified - will search for XML files'}`);
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
            // Use the specified coverage file name
            actualCoverageFilePath = path.join(testResultFolderName, coverageFileName);

            if (!fs.existsSync(actualCoverageFilePath)) {
                console.log(`Warning: Specified coverage file not found at ${actualCoverageFilePath}`);
                console.log('Looking for coverage files in the test result directory...');
                actualCoverageFilePath = ''; // Reset to trigger search
            }
        }

        // If no file specified or specified file not found, search for XML files
        if (!actualCoverageFilePath) {
            console.log('Searching for XML coverage files in the test result directory...');

            // Try to find any XML coverage files
            try {
                const result = execSync(`find ${testResultFolderName} -name "*.xml" | grep -i coverage`, { encoding: 'utf8' });
                if (result.trim()) {
                    // Get the first found file
                    const foundFiles = result.trim().split('\n');
                    actualCoverageFilePath = foundFiles[0].trim();
                    console.log(`Found potential coverage files: ${result}`);
                    console.log(`Using the first found coverage file: ${actualCoverageFilePath}`);
                }
            } catch (error) {
                console.log('No coverage files found');
            }
        }

        if (!fs.existsSync(actualCoverageFilePath)) {
            throw new Error(`No coverage file found to upload`);
        }

        console.log(`Uploading coverage file: ${actualCoverageFilePath}`);

        const verboseFlag = verbose ? ' --verbose' : '';

        // Upload the coverage file, see https://github.com/codecov/codecov-cli
        execSync(`./codecov${verboseFlag} upload-process -f "${actualCoverageFilePath}" -t "${codecovToken}"`, {
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
