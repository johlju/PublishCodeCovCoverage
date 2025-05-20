import * as fs from 'node:fs';
import * as path from 'node:path';
import axios, { type AxiosResponse } from 'axios';
import type { Stream } from 'node:stream';

/**
 * Downloads a file from a URL to a local destination
 * @param url The URL to download from
 * @param dest The local file path to save the downloaded file
 * @param options Additional options for the download
 * @param options.timeout Timeout in milliseconds before the request is aborted (default: 30000)
 * @param options.maxRedirects Maximum number of redirects to follow (default: 5)
 * @param options.signal AbortSignal to allow manual cancellation of the download
 * @param options.onProgress Optional callback for progress updates with { bytesReceived, totalBytes, percent }
 * @param options.overwrite Whether to overwrite the destination file if it already exists (default: true)
 * @param options.progressThrottleMs Throttle interval in milliseconds for progress updates (default: 200)
 * @returns A promise that resolves when the download is complete
 */
export function downloadFile(
  fileUrl: string,
  dest: string,
  options: {
    timeout?: number;
    maxRedirects?: number;
    signal?: AbortSignal;
    onProgress?: (progress: {
      bytesReceived: number;
      totalBytes: number | null;
      percent: number | null;
    }) => void;
    overwrite?: boolean;
    progressThrottleMs?: number;
  } = {}
): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`Downloading ${fileUrl} to ${dest}`);
  return new Promise<void>((resolve, reject) => {
    // Create an abort controller for the axios request
    const controller = new AbortController();
    // Use the provided signal or our controller's signal
    const signal = options.signal ?? controller.signal;

    // Check if the destination file already exists
    if (fs.existsSync(dest)) {
      // By default overwrite is true unless explicitly set to false
      if (options.overwrite === false) {
        // eslint-disable-next-line no-console
        console.log(`File already exists at '${dest}' and overwrite is false, skipping download`);
        return resolve();
      }
      // eslint-disable-next-line no-console
      console.log(`File already exists at '${dest}', will be overwritten`);
    }

    // Ensure parent directory exists
    const parentDir = path.dirname(dest);

    // Flags to track if cleanup has already been performed and if file is closed
    let cleanupPerformed = false;
    let fileIsClosed = false;
    let file: fs.WriteStream;
    // Use asynchronous directory creation to avoid blocking the event loop
    fs.promises
      .mkdir(parentDir, { recursive: true })
      .then(() => {
        // Create the file stream after the directory is successfully created
        file = fs.createWriteStream(dest);

        // Continue with the axios request after directory is created
        setupAxiosRequest();
      })
      .catch((err) => {
        return reject(
          new Error(`Failed to create directory '${parentDir}': ${(err as Error).message}`)
        );
      });

    // Define the function to set up the axios request
    const setupAxiosRequest = (): void => {
      // Setup axios config

      // Function to clean up on error
      const cleanup = (error: Error, response?: AxiosResponse<unknown>): void => {
        // Guard against multiple executions
        if (cleanupPerformed) {
          return;
        }

        // Mark cleanup as performed
        cleanupPerformed = true;

        // Abort the request if it's still in progress
        if (!signal.aborted) {
          // Only abort our own controller - external signals are managed by the caller
          if (signal === controller.signal) {
            controller.abort();
          }
        }

        // Destroy the response stream if it exists
        if (response?.data) {
          try {
            // Use the appropriate method to destroy/end the stream
            const stream = response.data as {
              destroy?: () => void;
              cancel?: () => void;
              end?: () => void;
            };
            stream?.destroy?.();
            stream?.cancel?.();
            stream?.end?.();
          } catch (e) {
            // Ignore errors when destroying the stream
            // eslint-disable-next-line no-console
            console.warn(
              `Warning: Failed to destroy stream: ${e instanceof Error ? e.message : String(e)}`
            );
          }
        }

        // Close the file if not already closed and wait for it to complete before accessing/deleting the file
        if (fileIsClosed) {
          // File already closed, proceed with cleanup
          fs.access(dest, fs.constants.F_OK, (accessErr) => {
            if (accessErr) {
              // File doesn't exist, just reject with the original error
              reject(error);
            } else {
              // File exists, try to delete it
              fs.unlink(dest, (unlinkErr) => {
                if (unlinkErr) {
                  // eslint-disable-next-line no-console
                  console.warn(
                    `Warning: Failed to clean up temporary file '${dest}': ${unlinkErr.message}`
                  );
                }
                reject(error);
              });
            }
          });
        } else {
          fileIsClosed = true;
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
                    // eslint-disable-next-line no-console
                    console.warn(
                      `Warning: Failed to clean up temporary file '${dest}': ${unlinkErr.message}`
                    );
                  }
                  reject(error);
                });
              }
            });
          });
        }
      };

      // Setup axios config
      axios({
        method: 'GET',
        url: fileUrl,
        responseType: 'stream',
        timeout: options.timeout ?? 30000,
        maxRedirects: options.maxRedirects ?? 5,
        signal: signal,
        validateStatus: () => true, // Don't throw on any status code
      })
        .then((response) => {
          // Handle non-success status codes
          if (response.status < 200 || response.status >= 300) {
            return cleanup(new Error(`Failed to get '${fileUrl}' (${response.status})`), response);
          }

          // Get total size from headers
          const totalBytes = getNumericHeader(response.headers, 'content-length');

          if (options.onProgress) {
            if (totalBytes !== null && totalBytes > 0) {
              // eslint-disable-next-line no-console
              console.log(`Total download size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
            } else {
              // eslint-disable-next-line no-console
              console.log(`Download started - total size unknown (Content-Length header missing)`);
            }
          }

          // Setup progress tracking manually since onDownloadProgress doesn't work with streams
          let bytesReceived = 0;
          let lastReportedPercent: number | null = null;
          const progressThrottleMs = options.progressThrottleMs ?? 200;
          let lastProgressTime = Date.now();

          if (options.onProgress) {
            // The chunk size here is dynamic and determined by:
            // 1. Node.js's HTTP client internal buffering
            // 2. OS network buffers and TCP packet sizes
            // 3. Server configuration and how it streams data
            // The size is not fixed and varies based on network conditions
            (response.data as Stream).on('data', (chunk: Buffer) => {
              bytesReceived += chunk.length;

              // Calculate percentage, capping at 100% to handle compressed data scenarios
              // where decompressed size might exceed the Content-Length header value
              let percent = null;
              if (!isNaN(totalBytes as number) && (totalBytes as number) > 0) {
                if (bytesReceived >= (totalBytes as number)) {
                  percent = 100; // Cap at 100% if received bytes exceed total bytes
                } else {
                  percent = Math.round((bytesReceived / (totalBytes as number)) * 100);
                }
              }

              // Throttle progress updates
              const now = Date.now();
              if (now - lastProgressTime >= progressThrottleMs || percent !== lastReportedPercent) {
                lastProgressTime = now;
                lastReportedPercent = percent;

                if (options.onProgress) {
                  options.onProgress({
                    bytesReceived,
                    totalBytes: totalBytes !== null && totalBytes > 0 ? totalBytes : null,
                    percent,
                  });
                }
              }
            });
          }

          // Pipe response to file
          (response.data as Stream).pipe(file);

          // Handle file events
          file.on('finish', () => {
            // Only close the file if it hasn't been closed already
            if (fileIsClosed) {
              // eslint-disable-next-line no-console
              console.log(`Downloaded ${fileUrl} successfully`);
              resolve();
              return;
            }

            fileIsClosed = true;

            // Close the file and resolve the promise
            file.close((err) => {
              if (err) {
                return cleanup(err, response);
              }
              // eslint-disable-next-line no-console
              console.log(`Downloaded ${fileUrl} successfully`);
              resolve();
            });
          });

          file.on('error', (err: Error) => {
            cleanup(err, response);
          });

          // Handle stream errors
          (response.data as Stream).on('error', (err: Error) => {
            cleanup(err, response);
          });
        })
        .catch((error: unknown) => {
          // Handle axios errors (network issues, timeout, etc.)
          if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
            cleanup(
              new Error(`Request timed out after ${options.timeout ?? 30000}ms: ${fileUrl}`),
              error.response
            );
          } else if (axios.isCancel(error)) {
            cleanup(new Error(`Download aborted by user: ${fileUrl}`));
          } else {
            cleanup(
              error instanceof Error ? error : new Error(String(error)),
              axios.isAxiosError(error) ? error.response : undefined
            );
          }
        });
    };
  });
}

/**
 * Safely extracts and parses a numeric header from an Axios response.
 * Returns null if the header is missing or not a valid number.
 */
function getNumericHeader(headers: Record<string, unknown>, headerName: string): number | null {
  const value = headers[headerName];
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return !isNaN(parsed) ? parsed : null;
  }
  return null;
}
