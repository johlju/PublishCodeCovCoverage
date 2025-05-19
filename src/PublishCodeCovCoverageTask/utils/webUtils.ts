import * as fs from 'node:fs';
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
export async function downloadFile(
    fileUrl: string,
    dest: string,
    options: {
        timeout?: number,
        maxRedirects?: number,
        _redirectCount?: number, // Kept for backward compatibility but no longer used internally
        signal?: AbortSignal,
        onProgress?: (progress: { bytesReceived: number, totalBytes: number | null, percent: number | null }) => void
    } = {}
): Promise<void> {
    console.log(`Downloading ${fileUrl} to ${dest}`);

    return new Promise<void>(async (resolve, reject) => {
        // Create the file stream
        const file = fs.createWriteStream(dest);

        // Function to clean up on error
        const cleanup = (error: Error) => {
            file.close();
            fs.unlink(dest, (unlinkErr) => {
                if (unlinkErr) {
                    console.warn(`Warning: Failed to clean up temporary file '${dest}': ${unlinkErr.message}`);
                }
                reject(error);
            });
        };

        try {
            // Setup axios config
            const response = await axios({
                method: 'GET',
                url: fileUrl,
                responseType: 'stream',
                timeout: options.timeout || 30000,
                maxRedirects: options.maxRedirects || 5,
                signal: options.signal,
                validateStatus: null, // Don't throw on any status code
                onDownloadProgress: options.onProgress ?
                    // Note: onDownloadProgress doesn't work with stream responseType,
                    // but we keep it in case axios implementation changes in the future
                    (progressEvent) => {
                        const progress = {
                            bytesReceived: progressEvent.loaded,
                            totalBytes: progressEvent.total || null,
                            percent: progressEvent.total ? Math.round((progressEvent.loaded / progressEvent.total) * 100) : null
                        };
                        options.onProgress!(progress);
                    } : undefined
            });

            // Handle non-success status codes
            if (response.status !== 200) {
                return cleanup(new Error(`Failed to get '${fileUrl}' (${response.status})`));
            }

            // Get total size from headers
            const totalBytes = parseInt(response.headers['content-length'] || '0', 10);

            if (!isNaN(totalBytes) && totalBytes > 0 && options.onProgress) {
                console.log(`Total download size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
            }

            // Setup progress tracking manually since onDownloadProgress doesn't work with streams
            let bytesReceived = 0;
            if (options.onProgress) {
                (response.data as Stream).on('data', (chunk) => {
                    bytesReceived += chunk.length;
                    options.onProgress!({
                        bytesReceived,
                        totalBytes: isNaN(totalBytes) ? null : totalBytes,
                        percent: isNaN(totalBytes) ? null : Math.round((bytesReceived / totalBytes) * 100)
                    });
                });
            }

            // Pipe response to file
            (response.data as Stream).pipe(file);

            // Handle file events
            file.on('finish', () => {
                file.close((err) => {
                    if (err) {
                        return cleanup(err);
                    }
                    console.log(`Downloaded ${fileUrl} successfully`);
                    resolve();
                });
            });

            file.on('error', (err) => {
                cleanup(err);
            });

            // Handle stream errors
            (response.data as Stream).on('error', (err) => {
                cleanup(err);
            });
        } catch (error) {
            // Handle axios errors (network issues, timeout, etc.)
            if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
                cleanup(new Error(`Request timed out after ${options.timeout || 30000}ms: ${fileUrl}`));
            } else if (axios.isAxiosError(error) && error.code === 'ERR_CANCELED') {
                cleanup(new Error(`Download aborted by user: ${fileUrl}`));
            } else {
                cleanup(error as Error);
            }
        }
    });
}
