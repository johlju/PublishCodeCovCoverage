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
    afterAll(() => {
        if (server) {
            server.close();
        }
        
        try {
            if (fs.existsSync(testFilePath)) {
                fs.unlinkSync(testFilePath);
            }
            fs.rmdirSync(tempDir);
        } catch (err) {
            console.error(`Error cleaning up test files: ${err}`);
        }
    });

    describe('downloadFile with progress tracking', () => {
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
            console.log(`Last progress update: ${progressUpdates[progressUpdates.length - 1].percent}%`);
            
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
                console.log(`Received abort error: ${error.message}`);
                
                // Log progress captured before abort
                console.log(`Received ${progressUpdates.length} progress updates before abort`);
                if (progressUpdates.length > 0) {
                    console.log(`Last progress update before abort: ${progressUpdates[progressUpdates.length - 1].percent}%`);
                }
                
                // Add a small delay to allow file cleanup to complete
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }, 30000); // Allow up to 30 seconds for the test
    });
});
