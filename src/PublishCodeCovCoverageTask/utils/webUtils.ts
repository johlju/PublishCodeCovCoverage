import * as fs from 'fs';
import * as https from 'https';

/**
 * Downloads a file from a URL to a local destination
 * @param url The URL to download from
 * @param dest The local file path to save the downloaded file
 * @returns A promise that resolves when the download is complete
 */
export async function downloadFile(url: string, dest: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
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
