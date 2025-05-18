import * as fs from 'node:fs';
import * as https from 'node:https';
import * as http from 'node:http';
import * as url from 'node:url';

/**
 * Downloads a file from a URL to a local destination
 * @param url The URL to download from
 * @param dest The local file path to save the downloaded file
 * @param options Additional options for the download
 * @param options.timeout Timeout in milliseconds before the request is aborted (default: 30000)
 * @param options.maxRedirects Maximum number of redirects to follow (default: 5)
 * @param options._redirectCount Internal counter for number of redirects followed (don't set this manually)
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
        _redirectCount?: number,
        signal?: AbortSignal,
        onProgress?: (progress: { bytesReceived: number, totalBytes: number | null, percent: number | null }) => void
    } = {}
): Promise<void> {
    const timeout = options.timeout || 30000; // Default timeout of 30 seconds
    const maxRedirects = options.maxRedirects || 5; // Default max 5 redirects
    const redirectCount = options._redirectCount || 0;
    const signal = options.signal;
    const onProgress = options.onProgress;

    return new Promise<void>((resolve, reject) => {
        console.log(`Downloading ${fileUrl} to ${dest}`);

        // Check if already aborted before starting
        if (signal?.aborted) {
            return reject(new Error(`Download aborted: ${fileUrl}`));
        }

        // Parse the URL to determine if it uses http or https
        const parsedUrl = new url.URL(fileUrl);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;

        // Create the file stream
        const file = fs.createWriteStream(dest);

        // Function to clean up resources and reject with an error
        const cleanupAndReject = (error: Error) => {
            file.close();
            fs.unlink(dest, (unlinkErr) => {
                if (unlinkErr) {
                    console.warn(`Warning: Failed to clean up temporary file '${dest}': ${unlinkErr.message}`);
                }
                reject(error);
            });
        };

        // Set up abort handler if signal is provided
        let abortHandler: (() => void) | undefined;
        if (signal) {
            abortHandler = () => {
                if (req) {
                    req.destroy();
                    cleanupAndReject(new Error(`Download aborted by user: ${fileUrl}`));
                }
            };
            signal.addEventListener('abort', abortHandler);
        }

        // Create the request
        const req = protocol.get(fileUrl, (response) => {
            // Handle redirects
            if (response.statusCode && [301, 302, 307, 308].includes(response.statusCode)) {
                // Close the file since we'll be creating a new one for the redirected URL
                file.close();
                fs.unlink(dest, (unlinkErr) => {
                    if (unlinkErr) {
                        console.warn(`Warning: Failed to clean up temporary file '${dest}' during redirect: ${unlinkErr.message}`);
                    }
                    // Get the redirect URL
                    const redirectUrl = response.headers.location;

                    if (!redirectUrl) {
                        return reject(new Error(`Redirect received but no location header for '${fileUrl}'`));
                    }

                    // Check if we've exceeded the maximum number of redirects
                    if (redirectCount >= maxRedirects) {
                        return reject(new Error(`Maximum redirect count (${maxRedirects}) reached for '${fileUrl}'`));
                    }

                    console.log(`Following redirect (${redirectCount + 1}/${maxRedirects}): ${redirectUrl}`);

                    // Clean up the abort listener before recursive call
                    if (signal && abortHandler) {
                        signal.removeEventListener('abort', abortHandler);
                    }

                    // Recursively call downloadFile with the new URL and incremented redirect count
                    downloadFile(
                        // Handle both absolute and relative redirect URLs
                        redirectUrl.startsWith('http') ? redirectUrl : new url.URL(redirectUrl, fileUrl).href,
                        dest,
                        {
                            timeout,
                            maxRedirects,
                            _redirectCount: redirectCount + 1,
                            signal, // Pass along the abort signal to the redirected request
                            onProgress // Pass along the progress callback
                        }
                    )
                    .then(resolve)
                    .catch(reject);
                });
                return;
            }

            // Handle non-success status codes
            if (response.statusCode !== 200) {
                file.close();
                fs.unlink(dest, (unlinkErr) => {
                    if (unlinkErr) {
                        console.warn(`Warning: Failed to clean up temporary file '${dest}' after HTTP error: ${unlinkErr.message}`);
                    }
                    reject(new Error(`Failed to get '${fileUrl}' (${response.statusCode})`));
                });
                return;
            }            // Get the total file size from the response headers
            const totalBytes = parseInt(response.headers && response.headers['content-length'] || '', 10);

            let bytesReceived = 0;            // Set up progress tracking
            if (onProgress && typeof response.on === 'function') {
                if (!isNaN(totalBytes)) {
                    console.log(`Total download size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
                }

                response.on('data', (chunk) => {
                    bytesReceived += chunk.length;

                    onProgress({
                        bytesReceived,
                        totalBytes: isNaN(totalBytes) ? null : totalBytes,
                        percent: isNaN(totalBytes) ? null : Math.round((bytesReceived / totalBytes) * 100)
                    });
                });
            }            // Pipe the response to the file
            response.pipe(file);

            file.on('finish', () => {
                // Clean up abort listener on success
                if (signal && abortHandler) {
                    signal.removeEventListener('abort', abortHandler);
                }

                file.close((err) => {
                    if (err) {
                        fs.unlink(dest, (unlinkErr) => {
                            if (unlinkErr) {
                                console.warn(`Warning: Failed to clean up temporary file '${dest}' after file close error: ${unlinkErr.message}`);
                            }
                            reject(err);
                        });
                        return;
                    }
                    console.log(`Downloaded ${fileUrl} successfully`);
                    resolve();
                });
            });

            file.on('error', (err) => {
                // Clean up abort listener on file error
                if (signal && abortHandler) {
                    signal.removeEventListener('abort', abortHandler);
                }

                // Clean up file on error
                fs.unlink(dest, (unlinkErr) => {
                    if (unlinkErr) {
                        console.warn(`Warning: Failed to clean up temporary file '${dest}' after file stream error: ${unlinkErr.message}`);
                    }
                    reject(err);
                });
            });
        }).on('error', (err) => {
            // Clean up abort listener on request error
            if (signal && abortHandler) {
                signal.removeEventListener('abort', abortHandler);
            }

            // Clean up file on request error
            file.close();
            fs.unlink(dest, (unlinkErr) => {
                if (unlinkErr) {
                    console.warn(`Warning: Failed to clean up temporary file '${dest}' after request error: ${unlinkErr.message}`);
                }
                reject(err);
            });
        });

        // Set up timeout to abort the request if it takes too long
        req.setTimeout(timeout, () => {
            req.destroy();

            // Clean up abort listener on timeout
            if (signal && abortHandler) {
                signal.removeEventListener('abort', abortHandler);
            }

            cleanupAndReject(new Error(`Request timed out after ${timeout}ms: ${fileUrl}`));
        });
    });
}
