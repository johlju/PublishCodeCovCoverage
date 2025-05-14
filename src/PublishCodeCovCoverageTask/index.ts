import * as tl from 'azure-pipelines-task-lib/task';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import { execSync } from 'child_process';

async function run(): Promise<void> {
    try {
        // Set resource path for localization
        const taskJsonPath = path.join(__dirname, 'task.json');
        if (fs.existsSync(taskJsonPath)) {
            tl.setResourcePath(taskJsonPath);
        }
          // Get input parameters
        const buildFolderName = tl.getInput('buildFolderName', true) || '';
        const testResultFolderName = tl.getInput('testResultFolderName', true) || '';
        
        // Get environment variables
        const codecovToken = tl.getVariable('CODECOV_TOKEN') || process.env.CODECOV_TOKEN;
        const codecovUrl = tl.getVariable('CODECOV_URL') || process.env.CODECOV_URL || 'https://codecov.io';

        console.log('Uploading code coverage to Codecov.io');
        console.log(`Build folder: ${buildFolderName}`);
        console.log(`Test result folder: ${testResultFolderName}`);
        console.log(`Codecov URL: ${codecovUrl}`);

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
        const coverageFilePath = path.join(buildFolderName, testResultFolderName, 'JaCoCo_coverage.xml');
        
        if (!fs.existsSync(coverageFilePath)) {
            console.log(`Warning: Coverage file not found at ${coverageFilePath}`);
            console.log('Looking for coverage files in the build directory...');
            
            // Try to find any XML coverage files
            try {
                const result = execSync(`find ${buildFolderName} -name "*.xml" | grep -i coverage`, { encoding: 'utf8' });
                if (result.trim()) {
                    console.log(`Found potential coverage files: ${result}`);
                }
            } catch (error) {
                console.log('No coverage files found');
            }
        }

        console.log(`Uploading coverage file: ${coverageFilePath}`);
        execSync(`./codecov upload-process -f "${coverageFilePath}" -t "${codecovToken}" -u "${codecovUrl}"`, { 
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

async function downloadFile(url: string, dest: string): Promise<void> {
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

// Execute the task
run().catch(err => {
    console.error('Unhandled error:', err);
    tl.setResult(tl.TaskResult.Failed, `Unhandled error: ${err.message}`);
});
