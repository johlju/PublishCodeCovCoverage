// filepath: /Users/johlju/source/PublishCodeCovCoverage/src/PublishCodeCovCoverageTask/__tests__/webUtils.test.ts
import axios from 'axios';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import { downloadFile } from '../utils/webUtils';

// Create fully typed mock implementations
jest.mock('node:fs', () => {
  const mockFs = {
    createWriteStream: jest.fn(),
    access: jest.fn(),
    unlink: jest.fn(),
    mkdirSync: jest.fn(),
    existsSync: jest.fn(),
    writeFileSync: jest.fn(),
    readFileSync: jest.fn(),
    constants: { F_OK: 1 },
    promises: {
      mkdir: jest.fn().mockResolvedValue(undefined),
    },
  };
  return mockFs;
});

/**
 * Mock axios module for testing.
 * IMPORTANT: This project uses strongly-typed mocks for better maintainability.
 * * Benefits:
 * - Type safety: mockAxios is typed as jest.MockedFunction<typeof axios> & Partial<jest.Mocked<typeof axios>> which ensures all mock
 *   implementations maintain the correct typing and return values match the axios API, including static methods
 * - Prevents runtime errors: Compiler catches type mismatches that would otherwise cause runtime failures
 * - Better IDE support: Proper autocompletion for mock methods and parameters
 * - Better testing practices: Using jest.mockResolvedValueOnce() instead of mockReturnValueOnce(Promise.resolve())
 *   for clearer and more idiomatic Jest usage
 * - Consistent pattern: Always use mockAxios for all axios-related mocking, which improves test readability
 * - Easier refactoring: When the axios API changes, TypeScript will identify all impacted test code
 *
 * Implementation guidelines:
 * 1. ALWAYS declare mocks with proper typing: let mockAxios: jest.MockedFunction<typeof axios> & Partial<jest.Mocked<typeof axios>>
 * 2. ALWAYS use mockResolvedValueOnce() instead of mockReturnValueOnce(Promise.resolve())
 * 3. ALWAYS use mockRejectedValueOnce() instead of mockReturnValueOnce(Promise.reject())
 * 4. NEVER use type assertions like (axios as any) - this defeats the purpose of typed mocks
 * 5. For helper functions that aren't directly mockable via the type system (like isAxiosError),
 *    use (mockAxios as any).helperFunction = jest.fn() but keep these to a minimum
 *
 * IMPORTANT: Do not revert to using (axios as any) or untyped mock variables.
 * Using proper typed mocks is a requirement for this codebase.
 */
jest.mock('axios');

describe('webUtils', () => {
  // Setup mocks
  let mockFs: any;
  // Use a type that combines both the function mock and the static properties
  let mockAxios: jest.MockedFunction<typeof axios> & Partial<jest.Mocked<typeof axios>>;
  let mockFileStream: any;
  let mockDataStream: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock console methods
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Get the mocked modules
    mockFs = fs as jest.Mocked<typeof fs>;

    // Set default behavior for existsSync (default to false - file doesn't exist)
    mockFs.existsSync.mockReturnValue(false);

    // Set up axios mock - using combined type to handle both the callable function aspect and static properties
    mockAxios = axios as jest.MockedFunction<typeof axios> & Partial<jest.Mocked<typeof axios>>;

    // Set up default mocks for axios static methods
    (mockAxios as any).isAxiosError = jest.fn().mockReturnValue(false);
    (mockAxios as any).isCancel = jest.fn().mockReturnValue(false);

    // Create mock file stream
    mockFileStream = new EventEmitter();
    mockFileStream.close = jest.fn((callback?: (err?: Error | null) => void) => {
      if (callback) callback();
    });
    mockFileStream.pipe = jest.fn(() => mockFileStream);

    // Spy on the .on method to properly track event registrations for the file stream
    jest.spyOn(mockFileStream, 'on');

    // Create mock data stream
    mockDataStream = new EventEmitter();
    mockDataStream.pipe = jest.fn((target) => target);

    // Spy on the .on method to properly track event registrations
    jest.spyOn(mockDataStream, 'on');

    // Setup fs.createWriteStream mock
    mockFs.createWriteStream.mockReturnValue(mockFileStream);
  });

  afterEach(() => {
    // Restore all mocks to prevent side effects in other test files
    jest.restoreAllMocks();
  });

  describe('downloadFile', () => {
    test('should ensure parent directory exists before downloading', async () => {
      // Configure axios to return a valid response
      mockAxios.mockResolvedValueOnce({
        status: 200,
        headers: { 'content-length': '1024' },
        data: mockDataStream,
      });

      // Call downloadFile function with a path that includes directories
      const downloadPromise = downloadFile(
        'https://example.com/file.zip',
        '/path/to/nested/directory/file.zip'
      );

      // Simulate file stream completion
      setTimeout(() => {
        mockFileStream.emit('finish');
        // Emit close event instead of directly accessing mock.calls
        mockFileStream.emit('close');
      }, 100);

      // Wait for the download to complete
      await downloadPromise;
      // Verify the directory was created asynchronously
      expect(mockFs.promises.mkdir).toHaveBeenCalledWith('/path/to/nested/directory', {
        recursive: true,
      });
      expect(mockFs.createWriteStream).toHaveBeenCalledWith('/path/to/nested/directory/file.zip');
    });

    test('should handle errors during directory creation', async () => {
      // Make promises.mkdir reject with an error
      const dirError = new Error('Directory creation failed');
      mockFs.promises.mkdir.mockRejectedValueOnce(dirError);

      // Call downloadFile and expect it to reject due to directory creation failure
      await expect(
        downloadFile('https://example.com/file.zip', '/path/to/error/directory/file.zip')
      ).rejects.toThrow(
        "Failed to create directory '/path/to/error/directory': Directory creation failed"
      );

      // Verify that createWriteStream was not called
      expect(mockFs.createWriteStream).not.toHaveBeenCalled();
      // Verify that axios was not called
      expect(mockAxios).not.toHaveBeenCalled();
    });

    test('should download a file successfully', async () => {
      // Override axios function call with a resolved value
      mockAxios.mockResolvedValueOnce({
        status: 200,
        headers: { 'content-length': '1024' },
        data: mockDataStream,
      });

      // Call downloadFile function
      const downloadPromise = downloadFile(
        'https://example.com/file.zip',
        '/path/to/destination.zip'
      );

      // Simulate data chunks coming in
      mockDataStream.emit('data', Buffer.from('chunk1'));
      mockDataStream.emit('data', Buffer.from('chunk2'));

      // Simulate file stream completion
      setTimeout(() => {
        mockFileStream.emit('finish');
        // Emit close event instead of directly accessing mock.calls
        mockFileStream.emit('close');
      }, 100);

      // Wait for the download to complete
      await downloadPromise;

      // Verify the expected calls were made
      expect(mockFs.createWriteStream).toHaveBeenCalledWith('/path/to/destination.zip');
      expect(mockAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: 'https://example.com/file.zip',
          responseType: 'stream',
          timeout: 30000,
          maxRedirects: 5,
        })
      );
      expect(mockDataStream.pipe).toHaveBeenCalledWith(mockFileStream);
    });

    test('should handle other 2xx status codes (204 and 206)', async () => {
      // Test for 204 No Content
      mockAxios.mockResolvedValueOnce({
        status: 204, // No Content
        headers: {}, // No content-length for 204
        data: mockDataStream,
      });

      // Call downloadFile function for 204
      const downloadPromise204 = downloadFile(
        'https://example.com/empty-resource',
        '/path/to/empty-file'
      );

      // Simulate file stream completion
      setTimeout(() => {
        mockFileStream.emit('finish');
        // Emit close event instead of directly accessing mock.calls
        mockFileStream.emit('close');
      }, 100);

      // Wait for the download to complete
      await downloadPromise204;

      // Verify the download was successful with status 204
      expect(mockAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://example.com/empty-resource',
        })
      );

      jest.clearAllMocks();

      // Test for 206 Partial Content
      mockAxios.mockResolvedValueOnce({
        status: 206, // Partial Content
        headers: { 'content-length': '512', 'content-range': 'bytes 0-511/1024' },
        data: mockDataStream,
      });

      // Call downloadFile function for 206
      const downloadPromise206 = downloadFile(
        'https://example.com/partial-content',
        '/path/to/partial-file'
      );

      // Simulate data chunks coming in
      mockDataStream.emit('data', Buffer.from('partial-content'));

      // Simulate file stream completion
      setTimeout(() => {
        mockFileStream.emit('finish');
        // Emit close event instead of directly accessing mock.calls
        mockFileStream.emit('close');
      }, 100);

      // Wait for the download to complete
      await downloadPromise206;

      // Verify the download was successful with status 206
      expect(mockAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://example.com/partial-content',
        })
      );
    });

    test('should handle progress tracking', async () => {
      // Override axios function call
      mockAxios.mockResolvedValueOnce({
        status: 200,
        headers: { 'content-length': '1000' },
        data: mockDataStream,
      });

      // Progress tracking mock
      const onProgressMock = jest.fn(); // Call downloadFile function with progress tracking
      const downloadPromise = downloadFile(
        'https://example.com/file.zip',
        '/path/to/destination.zip',
        { onProgress: onProgressMock }
      );

      // The problem is that the data events need to happen AFTER the axios call
      // has been processed inside downloadFile and the 'data' event listener has been attached
      setTimeout(() => {
        // Simulate data chunks coming in
        mockDataStream.emit('data', Buffer.from('a'.repeat(250)));
        mockDataStream.emit('data', Buffer.from('b'.repeat(250)));
        mockDataStream.emit('data', Buffer.from('c'.repeat(500)));
      }, 10);

      // Simulate file stream completion with proper close event
      setTimeout(() => {
        mockFileStream.emit('finish');
        // Emit close event instead of directly accessing mock.calls
        mockFileStream.emit('close');
      }, 100);

      // Wait for the download to complete
      await downloadPromise;

      // Verify progress tracking
      expect(onProgressMock).toHaveBeenCalledTimes(3);
      expect(onProgressMock).toHaveBeenNthCalledWith(1, {
        bytesReceived: 250,
        totalBytes: 1000,
        percent: 25,
      });
      expect(onProgressMock).toHaveBeenNthCalledWith(2, {
        bytesReceived: 500,
        totalBytes: 1000,
        percent: 50,
      });
      expect(onProgressMock).toHaveBeenNthCalledWith(3, {
        bytesReceived: 1000,
        totalBytes: 1000,
        percent: 100,
      });
    });

    test('should handle HTTP error status', async () => {
      // Setup file handling mocks
      mockFs.access.mockImplementation(
        (path: string, mode: number, callback: (err: Error | null) => void) => {
          callback(null); // No error means file exists
        }
      );

      mockFs.unlink.mockImplementation((path: string, callback: (err: Error | null) => void) => {
        callback(null); // No error means file was deleted
      });

      // Override axios function call with non-200 status
      mockAxios.mockResolvedValueOnce({
        status: 404,
        statusText: 'Not Found',
      });

      // Call downloadFile and expect it to reject
      await expect(
        downloadFile('https://example.com/nonexistent.zip', '/path/to/destination.zip')
      ).rejects.toThrow("Failed to get 'https://example.com/nonexistent.zip' (404)");

      // Verify fs.unlink was called to clean up
      expect(mockFs.unlink).toHaveBeenCalledWith('/path/to/destination.zip', expect.any(Function));
    });

    test('should handle network errors', async () => {
      // Setup file handling mocks
      mockFs.access.mockImplementation(
        (path: string, mode: number, callback: (err: Error | null) => void) => {
          callback(null); // No error means file exists
        }
      );

      mockFs.unlink.mockImplementation((path: string, callback: (err: Error | null) => void) => {
        callback(null); // No error means file was deleted
      });

      // Create an Axios error for network issues
      const networkError = new Error('Network Error');
      Object.defineProperty(networkError, 'isAxiosError', { value: true });

      // Override axios function call with rejection
      mockAxios.mockRejectedValueOnce(networkError);
      // Set up isAxiosError helper
      (mockAxios as any).isAxiosError.mockReturnValue(true);

      // Make sure isCancel returns false for this network error
      (mockAxios as any).isCancel.mockReturnValue(false);

      // Call downloadFile and expect it to reject
      await expect(
        downloadFile('https://example.com/file.zip', '/path/to/destination.zip')
      ).rejects.toThrow('Network Error');

      // Verify cleanup was performed
      expect(mockFs.unlink).toHaveBeenCalledWith('/path/to/destination.zip', expect.any(Function));
    });

    test('should handle timeout errors', async () => {
      // Setup file handling mocks
      mockFs.access.mockImplementation(
        (path: string, mode: number, callback: (err: Error | null) => void) => {
          callback(null); // No error means file exists
        }
      );

      mockFs.unlink.mockImplementation((path: string, callback: (err: Error | null) => void) => {
        callback(null); // No error means file was deleted
      });

      // Create an Axios error for timeout
      const timeoutError = new Error('Timeout');
      Object.defineProperty(timeoutError, 'isAxiosError', { value: true });
      Object.defineProperty(timeoutError, 'code', { value: 'ECONNABORTED' });

      // Override axios function call with rejection
      mockAxios.mockRejectedValueOnce(timeoutError);
      // Set up isAxiosError helper
      (mockAxios as any).isAxiosError.mockReturnValue(true);

      // Make sure isCancel returns false for this timeout error
      (mockAxios as any).isCancel.mockReturnValue(false);

      // Call downloadFile with a custom timeout
      await expect(
        downloadFile('https://example.com/file.zip', '/path/to/destination.zip', { timeout: 5000 })
      ).rejects.toThrow('Request timed out after 5000ms');

      // Verify timeout was set correctly
      expect(mockAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 5000,
        })
      );

      // Verify cleanup was performed
      expect(mockFs.unlink).toHaveBeenCalledWith('/path/to/destination.zip', expect.any(Function));
    });

    test('should handle aborted requests with ERR_CANCELED code', async () => {
      // Setup file handling mocks
      mockFs.access.mockImplementation(
        (path: string, mode: number, callback: (err: Error | null) => void) => {
          callback(null); // No error means file exists
        }
      );

      mockFs.unlink.mockImplementation((path: string, callback: (err: Error | null) => void) => {
        callback(null); // No error means file was deleted
      });

      // Create an Axios error for abort
      const abortError = new Error('Request aborted');
      Object.defineProperty(abortError, 'isAxiosError', { value: true });
      Object.defineProperty(abortError, 'code', { value: 'ERR_CANCELED' });

      // Override axios function call with rejection
      mockAxios.mockRejectedValueOnce(abortError);
      // Set up isAxiosError helper
      (mockAxios as any).isAxiosError.mockReturnValue(true);

      // Explicitly set isCancel to false to test the older code path with ERR_CANCELED
      (mockAxios as any).isCancel.mockReturnValue(false);

      // Create an AbortSignal
      const abortController = new AbortController();

      // Call downloadFile with the abort signal
      const downloadPromise = downloadFile(
        'https://example.com/file.zip',
        '/path/to/destination.zip',
        { signal: abortController.signal }
      );

      // Wait for the download to reject - the actual error thrown is the original error message
      // since our mock for isCancel returns false and the error handling doesn't recognize it as a cancellation
      await expect(downloadPromise).rejects.toThrow('Request aborted');

      // Verify axios.isCancel was called but returned false
      expect(mockAxios.isCancel).toHaveBeenCalledWith(abortError);

      // Verify cleanup was performed
      expect(mockFs.unlink).toHaveBeenCalledWith('/path/to/destination.zip', expect.any(Function));
    });

    test('should handle cancelled requests with axios.isCancel', async () => {
      // Setup file handling mocks
      mockFs.access.mockImplementation(
        (path: string, mode: number, callback: (err: Error | null) => void) => {
          callback(null); // No error means file exists
        }
      );

      mockFs.unlink.mockImplementation((path: string, callback: (err: Error | null) => void) => {
        callback(null); // No error means file was deleted
      });

      // Create a cancelled request error
      const cancelError = new Error('Request cancelled');

      // Override axios function call with rejection
      mockAxios.mockRejectedValueOnce(cancelError);
      // Mock axios.isCancel to return true for our cancelError
      (mockAxios as any).isCancel.mockReturnValue(true);

      // Create an AbortSignal
      const abortController = new AbortController();

      // Call downloadFile with the abort signal
      const downloadPromise = downloadFile(
        'https://example.com/file.zip',
        '/path/to/destination.zip',
        { signal: abortController.signal }
      );

      // Wait for the download to reject
      await expect(downloadPromise).rejects.toThrow('Download aborted by user');

      // Verify axios.isCancel was called with the correct error
      expect(mockAxios.isCancel).toHaveBeenCalledWith(cancelError);

      // Verify cleanup was performed
      expect(mockFs.unlink).toHaveBeenCalledWith('/path/to/destination.zip', expect.any(Function));
    });

    test('should handle AbortController cancellation via axios.isCancel', async () => {
      // Setup file handling mocks
      mockFs.access.mockImplementation(
        (path: string, mode: number, callback: (err: Error | null) => void) => {
          callback(null); // No error means file exists
        }
      );

      mockFs.unlink.mockImplementation((path: string, callback: (err: Error | null) => void) => {
        callback(null); // No error means file was deleted
      });

      // Create an AbortController
      const abortController = new AbortController();

      // Set up axios to simulate a cancellation when AbortController is used
      const cancelTokenError = new Error('Request aborted by AbortController');
      (mockAxios as any).isCancel.mockReturnValue(true);

      // Override axios function call with rejection that will happen after we abort
      mockAxios.mockImplementation(() => {
        // Return a promise that doesn't resolve immediately
        return new Promise((resolve, reject) => {
          // Schedule a rejection after a short delay to allow abort to be called
          setTimeout(() => {
            if (abortController.signal.aborted) {
              reject(cancelTokenError);
            } else {
              resolve({
                status: 200,
                headers: { 'content-length': '1024' },
                data: mockDataStream,
              });
            }
          }, 10);
        });
      });

      // Start the download
      const downloadPromise = downloadFile(
        'https://example.com/file.zip',
        '/path/to/destination.zip',
        { signal: abortController.signal }
      );

      // Abort the download after a short delay
      setTimeout(() => {
        abortController.abort();
      }, 5);

      // Wait for the download to reject
      await expect(downloadPromise).rejects.toThrow('Download aborted by user');

      // Verify axios.isCancel was called
      expect(mockAxios.isCancel).toHaveBeenCalledWith(cancelTokenError);

      // Verify cleanup was performed
      expect(mockFs.unlink).toHaveBeenCalledWith('/path/to/destination.zip', expect.any(Function));
    });

    test('should handle file stream errors', async () => {
      // Setup file handling mocks
      mockFs.access.mockImplementation(
        (path: string, mode: number, callback: (err: Error | null) => void) => {
          callback(null); // No error means file exists
        }
      );

      mockFs.unlink.mockImplementation((path: string, callback: (err: Error | null) => void) => {
        callback(null); // No error means file was deleted
      });

      // Override axios function call
      mockAxios.mockResolvedValueOnce({
        status: 200,
        headers: { 'content-length': '1024' },
        data: mockDataStream,
      });

      // Call downloadFile function
      const downloadPromise = downloadFile(
        'https://example.com/file.zip',
        '/path/to/destination.zip'
      );

      // Add a small delay to ensure event handlers are registered first
      setTimeout(() => {
        // Simulate a file stream error
        const fileError = new Error('File write error');
        mockFileStream.emit('error', fileError);
      }, 10);

      // Wait for the download to reject
      await expect(downloadPromise).rejects.toThrow('File write error');

      // Verify cleanup was performed
      expect(mockFs.unlink).toHaveBeenCalledWith('/path/to/destination.zip', expect.any(Function));
    });

    test('should prioritize axios.isCancel over ERR_CANCELED code', async () => {
      // Setup file handling mocks
      mockFs.access.mockImplementation(
        (path: string, mode: number, callback: (err: Error | null) => void) => {
          callback(null); // No error means file exists
        }
      );

      mockFs.unlink.mockImplementation((path: string, callback: (err: Error | null) => void) => {
        callback(null); // No error means file was deleted
      });

      // Create an error that is both an axios error with ERR_CANCELED AND can be detected by isCancel
      const hybridError = new Error('Request both canceled and aborted');
      Object.defineProperty(hybridError, 'isAxiosError', { value: true });
      Object.defineProperty(hybridError, 'code', { value: 'ERR_CANCELED' });

      // Override axios function call with rejection
      mockAxios.mockRejectedValueOnce(hybridError);
      // Set up both isAxiosError and isCancel to return true
      (mockAxios as any).isAxiosError.mockReturnValue(true);
      (mockAxios as any).isCancel.mockReturnValue(true);

      // Call downloadFile
      const downloadPromise = downloadFile(
        'https://example.com/file.zip',
        '/path/to/destination.zip'
      );

      // Wait for the download to reject
      await expect(downloadPromise).rejects.toThrow('Download aborted by user');

      // Verify both checks were made, but isCancel should be checked first
      expect(mockAxios.isCancel).toHaveBeenCalledWith(hybridError);

      // In the implementation, if isCancel returns true, isAxiosError should not be relevant
      // for determining the specific error message for cancellation

      // Verify cleanup was performed
      expect(mockFs.unlink).toHaveBeenCalledWith('/path/to/destination.zip', expect.any(Function));
    });
  });
});
