import * as tl from 'azure-pipelines-task-lib/task';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import * as crypto from 'crypto';
import { execSync } from 'child_process';

async function run() {
    try {
        const buildFolderName = tl.getInput('buildFolderName', true);
        const testResultFolderName = tl.getInput('testResultFolderName', true);
        const codecovToken = process.env.CODECOV_TOKEN;
        const codecovUrl = process.env.CODECOV_URL || 'https://codecov.io';

        if (!codecovToken) {
            throw new Error('CODECOV_TOKEN environment variable is not set');
        }

        const cliUrl = 'https://cli.codecov.io/latest/linux/codecov';
        const sha256sumUrl = 'https://cli.codecov.io/latest/linux/codecov.SHA256SUM';
        const sha256sumSigUrl = 'https://cli.codecov.io/latest/linux/codecov.SHA256SUM.sig';
        const pgpKeysUrl = 'https://keybase.io/codecovsecurity/pgp_keys.asc';

        await downloadFile(pgpKeysUrl, 'pgp_keys.asc');
        execSync('gpg --no-default-keyring --import pgp_keys.asc');

        await downloadFile(cliUrl, 'codecov');
        await downloadFile(sha256sumUrl, 'codecov.SHA256SUM');
        await downloadFile(sha256sumSigUrl, 'codecov.SHA256SUM.sig');

        execSync('gpg --verify codecov.SHA256SUM.sig codecov.SHA256SUM');
        execSync('shasum -a 256 -c codecov.SHA256SUM');
        fs.chmodSync('codecov', '755');

        const coverageFilePath = path.join(buildFolderName, testResultFolderName, 'JaCoCo_coverage.xml');
        execSync(`./codecov upload -f "${coverageFilePath}" -t "${codecovToken}" -u "${codecovUrl}"`);
    } catch (err) {
        tl.setResult(tl.TaskResult.Failed, err.message);
    }
}

async function downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                return reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => reject(err));
        });
    });
}

run();
