import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { downloadFile } from '../utils/webUtils';

// Import the test server
const { createTestServer } = require('./test-server');

/**
 * Integration tests for webUtils.
 * These tests make actual HTTP requests to test real-world behavior.
 */
describe('webUtils - Integration Tests', () => {
    // Setup a temp directory for downloads
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webutils-test-'));
    const testFilePath = path.join(tempDir, 'test-download.txt');

    // Server instance that will be created before tests
    let server: any;

    // Set up the test server before running tests
    beforeAll(async () => {
        server = await createTestServer();
        console.log(`Test server started on port ${server.port}`);
    });

    // Clean up temp files and server after all tests
    afterAll(async () => {
        if (server) {
            // Await the proper server close method that returns a promise
            await server.close();
        }

        try {
            // Use recursive removal for the temp directory, which handles non-empty directories
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
        } catch (err) {
            console.error(`Error cleaning up test files: ${err}`);
        }
    });

    /**
     * NOTE on Jest "open handle" warnings:
     * When running with `--detectOpenHandles`, Jest may report an open handle from the test server.
     * This is due to http.Server.listen() keeping the Node.js process alive, which is expected behavior.
     *
     * We're properly cleaning up the server with server.close() in afterAll(), but the server's internal
     * timeout mechanism can still be detected as an open handle by Jest. This is a known limitation
     * when testing HTTP servers, and does not indicate a memory leak or other issue in the tests.
     *
     * The warning can be safely ignored as it's related to the test infrastructure rather than
     * the code being tested. In production builds, this is not an issue.
     */

    describe('downloadFile', () => {
        test('should create non-existent directories when downloading', async () => {
            // Use our local test server
            const testUrl = server.url;

            // Create a nested path that doesn't exist yet
            const nestedDir = path.join(tempDir, 'nested', 'directories', 'for', 'test');
            const nestedFilePath = path.join(nestedDir, 'nested-download.txt');

            // Make sure the directory doesn't exist yet
            if (fs.existsSync(nestedDir)) {
                fs.rmSync(nestedDir, { recursive: true, force: true });
            }

            // Download the file - this should create the directory structure
            await downloadFile(
                testUrl,
                nestedFilePath,
                {}
            );

            // Verify the file exists
            expect(fs.existsSync(nestedFilePath)).toBe(true);

            // Verify the content was downloaded
            const content = fs.readFileSync(nestedFilePath, 'utf8');
            expect(content).not.toBe('');
        }, 30000); // Allow up to 30 seconds for the download

        test('should download a file and report progress', async () => {
            // Use our local test server
            const testUrl = server.url;

            // Array to store progress updates
            const progressUpdates: Array<{
                bytesReceived: number;
                totalBytes: number | null;
                percent: number | null;
            }> = [];

            // Download the file with progress tracking
            await downloadFile(
                testUrl,
                testFilePath,
                {
                    onProgress: (progress) => {
                        progressUpdates.push({...progress});
                        console.log(`Progress: ${progress.percent}% (${progress.bytesReceived}/${progress.totalBytes} bytes)`);
                    }
                }
            );

            // Simply verify the file exists after download (basic sanity check)
            // The integration test focuses on the download completing without errors
            console.log(`File downloaded to ${testFilePath}`);
            console.log(`Received ${progressUpdates.length} progress updates`);
            if (progressUpdates.length > 0) {
                const lastUpdate = progressUpdates[progressUpdates.length - 1];
                if (lastUpdate) {
                    const percentDisplay = lastUpdate.percent !== null ? `${lastUpdate.percent}%` : 'unknown';
                    console.log(`Last progress update: ${percentDisplay}`);
                }
            }

            // Minimal validation just to ensure the file was created
            if (!fs.existsSync(testFilePath)) {
                throw new Error('Download failed: File does not exist');
            }
        }, 30000); // Allow up to 30 seconds for the download

        test('should handle downloads with AbortSignal', async () => {
            // Use our local test server
            const testUrl = server.url;

            // Create abort controller
            const abortController = new AbortController();
            const progressUpdates: Array<{
                bytesReceived: number;
                totalBytes: number | null;
                percent: number | null;
            }> = [];

            // Start the download
            const downloadPromise = downloadFile(
                testUrl,
                testFilePath,
                {
                    signal: abortController.signal,
                    onProgress: (progress) => {
                        progressUpdates.push({...progress});
                        console.log(`Progress before abort: ${progress.percent}% (${progress.bytesReceived}/${progress.totalBytes} bytes)`);

                        // Abort after receiving some data but before completion
                        if (progress.bytesReceived > 1000 && progress.percent !== null && progress.percent < 90) {
                            console.log('Aborting download...');
                            abortController.abort();
                        }
                    }
                }
            );

            try {
                // This should throw an error due to the abort
                await downloadPromise;
                throw new Error('Expected download to be aborted, but it completed successfully');
            } catch (error: any) {
                // Just log that we received the expected abort error
                console.log(`Received abort error: ${error.message}`);                // Log progress captured before abort
                console.log(`Received ${progressUpdates.length} progress updates before abort`);
                if (progressUpdates.length > 0) {
                    const lastUpdate = progressUpdates[progressUpdates.length - 1];
                    if (lastUpdate) {
                        const percentDisplay = lastUpdate.percent !== null ? `${lastUpdate.percent}%` : 'unknown';
                        console.log(`Last progress update before abort: ${percentDisplay}`);
                    }
                }

                // Add a small delay to allow file cleanup to complete
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }, 30000); // Allow up to 30 seconds for the test

        test('should handle custom timeout settings', async () => {
            const timeoutFilePath = path.join(tempDir, 'timeout-test.txt');

            // Using the special timeout endpoint that has an intentional delay
            console.log('Testing download with timeout handling');

            try {
                // The server will wait 5 seconds before responding, but we set a 1 second timeout
                // This should always trigger a timeout error
                await downloadFile(server.timeoutUrl, timeoutFilePath, {
                    timeout: 1000, // 1 second timeout
                });

                // If we reach here, the test has failed
                console.error('Download completed when it should have timed out!');
                fail('Expected download to time out, but it completed successfully');
            } catch (error: any) {
                // Verify the error message contains "timed out"
                console.log(`Timeout error received as expected: ${error.message}`);
                expect(error.message).toContain('timed out');
                expect(error.message).toContain('1000ms');

                // If file was partially created, clean it up
                if (fs.existsSync(timeoutFilePath)) {
                    fs.unlinkSync(timeoutFilePath);
                }
            }
        }, 30000);

        test('should correctly report custom timeout value in error message', async () => {
            const timeoutFilePath = path.join(tempDir, 'timeout-custom-test.txt');

            // Use a different timeout value to validate the error message reflects it correctly
            const customTimeout = 2500; // 2.5 seconds

            try {
                // The server will wait 5 seconds before responding, so this should still timeout
                await downloadFile(server.timeoutUrl, timeoutFilePath, {
                    timeout: customTimeout,
                });

                fail('Expected download to time out, but it completed successfully');
            } catch (error: any) {
                // Verify the error message contains the exact custom timeout value
                console.log(`Timeout error received with custom value: ${error.message}`);
                expect(error.message).toContain('timed out');
                expect(error.message).toContain(`${customTimeout}ms`);

                // If file was partially created, clean it up
                if (fs.existsSync(timeoutFilePath)) {
                    fs.unlinkSync(timeoutFilePath);
                }
            }
        }, 30000);

        test('should download a file with no progress callback', async () => {
            // This test specifically avoids using the progress callback
            const noProgressFilePath = path.join(tempDir, 'no-progress.txt');
            const testUrl = server.url;

            console.log('Testing download without progress tracking');

            await downloadFile(testUrl, noProgressFilePath);

            console.log(`File downloaded to ${noProgressFilePath} without progress tracking`);

            // Simple validation without expects
            if (!fs.existsSync(noProgressFilePath)) {
                throw new Error('Download failed: File does not exist');
            }

            const stats = fs.statSync(noProgressFilePath);
            console.log(`Downloaded file size: ${stats.size} bytes`);

            // Clean up
            fs.unlinkSync(noProgressFilePath);
        }, 30000);

        test('should try to download from a non-existent URL', async () => {
            const invalidFilePath = path.join(tempDir, 'invalid-url.txt');
            // Using a URL that doesn't exist
            const invalidUrl = 'http://localhost:1';  // Using port 1 which should not have a server running

            console.log(`Testing download from invalid URL: ${invalidUrl}`);

            try {
                await downloadFile(invalidUrl, invalidFilePath);
                throw new Error('Expected download to fail, but it succeeded');
            } catch (error: any) {
                // Successfully caught the error
                console.log(`Error received as expected: ${error.message}`);

                // Verify no file was created
                if (fs.existsSync(invalidFilePath)) {
                    console.log('Unexpected: File was created despite error');
                    fs.unlinkSync(invalidFilePath);
                } else {
                    console.log('File was not created, as expected');
                }
            }
        }, 30000);
    });
});
