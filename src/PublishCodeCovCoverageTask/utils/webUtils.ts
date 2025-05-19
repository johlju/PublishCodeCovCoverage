import * as fs from 'node:fs';
import * as path from 'node:path';
import axios from 'axios';
import { Stream } from 'node:stream';

/**
 * Downloads a file from a URL to a local destination
 * @param url The URL to download from
 * @param dest The local file path to save the downloaded file
 * @param options Additional options for the download
 * @param options.timeout Timeout in milliseconds before the request is aborted (default: 30000)
 * @param options.maxRedirects Maximum number of redirects to follow (default: 5)
 * @param options.signal AbortSignal to allow manual cancellation of the download
 * @param options.onProgress Optional callback for progress updates with { bytesReceived, totalBytes, percent }
 * @returns A promise that resolves when the download is complete
 */
export function downloadFile(
    fileUrl: string,
    dest: string,
    options: {
        timeout?: number,
        maxRedirects?: number,
        signal?: AbortSignal,
        onProgress?: (progress: { bytesReceived: number, totalBytes: number | null, percent: number | null }) => void
    } = {}
): Promise<void> {
    console.log(`Downloading ${fileUrl} to ${dest}`);
    return new Promise<void>((resolve, reject) => {
        // Create an abort controller for the axios request
        const controller = new AbortController();
        // Use the provided signal or our controller's signal
        const signal = options.signal || controller.signal;

        // Ensure parent directory exists
        const parentDir = path.dirname(dest);
        try {
            fs.mkdirSync(parentDir, { recursive: true });
        } catch (err) {
            return reject(new Error(`Failed to create directory '${parentDir}': ${(err as Error).message}`));
        }

        // Create the file stream
        const file = fs.createWriteStream(dest);

        // Function to clean up on error
        const cleanup = (error: Error, response?: any) => {
            // Abort the request if it's still in progress
            if (!controller.signal.aborted) {
                controller.abort();
            }
              // Destroy the response stream if it exists
            if (response && response.data) {
                try {
                    // Use the appropriate method to destroy/end the stream
                    const stream = response.data;
                    if (typeof (stream as any).destroy === 'function') {
                        (stream as any).destroy();
                    } else if (typeof (stream as any).cancel === 'function') {
                        (stream as any).cancel();
                    } else if (typeof (stream as any).end === 'function') {
                        (stream as any).end();
                    }
                } catch (e) {
                    // Ignore errors when destroying the stream
                    console.warn(`Warning: Failed to destroy stream: ${(e as Error).message}`);
                }
            }

            // Close the file and wait for it to complete before accessing/deleting the file
            file.close(() => {
                // Check if file exists before trying to delete it
                fs.access(dest, fs.constants.F_OK, (accessErr) => {
                    if (accessErr) {
                        // File doesn't exist, just reject with the original error
                        reject(error);
                    } else {
                        // File exists, try to delete it
                        fs.unlink(dest, (unlinkErr) => {
                            if (unlinkErr) {
                                console.warn(`Warning: Failed to clean up temporary file '${dest}': ${unlinkErr.message}`);
                            }
                            reject(error);
                        });
                    }
                });
            });
        };

        // Setup axios config
        axios({
            method: 'GET',
            url: fileUrl,
            responseType: 'stream',
            timeout: options.timeout || 30000,
            maxRedirects: options.maxRedirects || 5,
            signal: signal,
            validateStatus: null // Don't throw on any status code
        })
            .then(response => {
                // Handle non-success status codes
                if (response.status < 200 || response.status >= 300) {
                    return cleanup(new Error(`Failed to get '${fileUrl}' (${response.status})`), response);
                }

                // Get total size from headers
                const contentLengthHeader = response.headers['content-length'];
                const totalBytes = contentLengthHeader !== undefined ? Number.parseInt(contentLengthHeader, 10) : NaN;

                if (options.onProgress) {
                    if (!isNaN(totalBytes) && totalBytes > 0) {
                        console.log(`Total download size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
                    } else {
                        console.log(`Download started - total size unknown (Content-Length header missing)`);
                    }
                }

                // Setup progress tracking manually since onDownloadProgress doesn't work with streams
                let bytesReceived = 0;
                if (options.onProgress) {
                    // The chunk size here is dynamic and determined by:
                    // 1. Node.js's HTTP client internal buffering
                    // 2. OS network buffers and TCP packet sizes
                    // 3. Server configuration and how it streams data
                    // The size is not fixed and varies based on network conditions
                    (response.data as Stream).on('data', (chunk) => {
                        bytesReceived += chunk.length;
                        options.onProgress!({
                            bytesReceived,
                            totalBytes: isNaN(totalBytes) || totalBytes <= 0 ? null : totalBytes,
                            percent: isNaN(totalBytes) || totalBytes <= 0 ? null : Math.round((bytesReceived / totalBytes) * 100)
                        });
                    });
                }

                // Pipe response to file
                (response.data as Stream).pipe(file);

                // Handle file events
                file.on('finish', () => {
                    file.close((err) => {
                        if (err) {
                            return cleanup(err, response);
                        }
                        console.log(`Downloaded ${fileUrl} successfully`);
                        resolve();
                    });
                });

                file.on('error', (err) => {
                    cleanup(err, response);
                });

                // Handle stream errors
                (response.data as Stream).on('error', (err) => {
                    cleanup(err, response);
                });
            })
            .catch(error => {
                // Handle axios errors (network issues, timeout, etc.)
                if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
                    cleanup(new Error(`Request timed out after ${options.timeout || 30000}ms: ${fileUrl}`), error.response);
                } else if (axios.isAxiosError(error) && error.code === 'ERR_CANCELED') {
                    cleanup(new Error(`Download aborted by user: ${fileUrl}`), error.response);
                } else {
                    cleanup(error as Error, axios.isAxiosError(error) ? error.response : undefined);
                }
            });
    });
}
