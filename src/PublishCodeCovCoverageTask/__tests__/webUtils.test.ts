// filepath: /Users/johlju/source/PublishCodeCovCoverage/src/PublishCodeCovCoverageTask/__tests__/webUtils.test.ts
import * as fs from 'node:fs';
import { EventEmitter } from 'node:events';
import axios from 'axios';
import { downloadFile } from '../utils/webUtils';

// Create fully typed mock implementations
jest.mock('node:fs', () => {
  const mockFs = {
    createWriteStream: jest.fn(),
    access: jest.fn(),
    unlink: jest.fn(),
    mkdirSync: jest.fn(),
    constants: { F_OK: 1 }
  };
  return mockFs;
});

jest.mock('axios');

describe('webUtils', () => {
  // Setup mocks
  let mockFs: any;
  let mockAxios: any;
  let mockFileStream: any;
  let mockDataStream: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock console methods
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Get the mocked modules
    mockFs = fs as jest.Mocked<typeof fs>;
    mockAxios = axios as jest.Mocked<typeof axios>;

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
      (axios as any).mockImplementationOnce(() => {
        return Promise.resolve({
          status: 200,
          headers: { 'content-length': '1024' },
          data: mockDataStream
        });
      });

      // Call downloadFile function with a path that includes directories
      const downloadPromise = downloadFile(
        'https://example.com/file.zip',
        '/path/to/nested/directory/file.zip'
      );

      // Simulate file stream completion
      setTimeout(() => {
        mockFileStream.emit('finish');
        mockFileStream.close.mock.calls[0][0]();
      }, 100);

      // Wait for the download to complete
      await downloadPromise;

      // Verify the directory was created
      expect(mockFs.mkdirSync).toHaveBeenCalledWith('/path/to/nested/directory', { recursive: true });
      expect(mockFs.createWriteStream).toHaveBeenCalledWith('/path/to/nested/directory/file.zip');
    });

    test('should handle errors during directory creation', async () => {
      // Make mkdirSync throw an error
      const dirError = new Error('Directory creation failed');
      mockFs.mkdirSync.mockImplementationOnce(() => {
        throw dirError;
      });

      // Call downloadFile and expect it to reject due to directory creation failure
      await expect(downloadFile(
        'https://example.com/file.zip',
        '/path/to/error/directory/file.zip'
      )).rejects.toThrow('Failed to create directory \'/path/to/error/directory\': Directory creation failed');

      // Verify that createWriteStream was not called
      expect(mockFs.createWriteStream).not.toHaveBeenCalled();
      // Verify that axios was not called
      expect(axios).not.toHaveBeenCalled();
    });

    test('should download a file successfully', async () => {
      // Override axios function call - use mockImplementationOnce instead
      (axios as any).mockImplementationOnce(() => {
        return Promise.resolve({
          status: 200,
          headers: { 'content-length': '1024' },
          data: mockDataStream
        });
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
        // Simulate the callback being called after close
        mockFileStream.close.mock.calls[0][0]();
      }, 100);

      // Wait for the download to complete
      await downloadPromise;

      // Verify the expected calls were made
      expect(mockFs.createWriteStream).toHaveBeenCalledWith('/path/to/destination.zip');
      expect(axios).toHaveBeenCalledWith(expect.objectContaining({
        method: 'GET',
        url: 'https://example.com/file.zip',
        responseType: 'stream',
        timeout: 30000,
        maxRedirects: 5
      }));
      expect(mockDataStream.pipe).toHaveBeenCalledWith(mockFileStream);
    });

    test('should handle other 2xx status codes (204 and 206)', async () => {
      // Test for 204 No Content
      (axios as any).mockImplementationOnce(() => {
        return Promise.resolve({
          status: 204, // No Content
          headers: { }, // No content-length for 204
          data: mockDataStream
        });
      });

      // Call downloadFile function for 204
      const downloadPromise204 = downloadFile(
        'https://example.com/empty-resource',
        '/path/to/empty-file'
      );

      // Simulate file stream completion
      setTimeout(() => {
        mockFileStream.emit('finish');
        mockFileStream.close.mock.calls[0][0]();
      }, 100);

      // Wait for the download to complete
      await downloadPromise204;

      // Verify the download was successful with status 204
      expect(axios).toHaveBeenCalledWith(expect.objectContaining({
        url: 'https://example.com/empty-resource'
      }));

      jest.clearAllMocks();

      // Test for 206 Partial Content
      (axios as any).mockImplementationOnce(() => {
        return Promise.resolve({
          status: 206, // Partial Content
          headers: { 'content-length': '512', 'content-range': 'bytes 0-511/1024' },
          data: mockDataStream
        });
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
        mockFileStream.close.mock.calls[0][0]();
      }, 100);

      // Wait for the download to complete
      await downloadPromise206;

      // Verify the download was successful with status 206
      expect(axios).toHaveBeenCalledWith(expect.objectContaining({
        url: 'https://example.com/partial-content'
      }));
    });

    test('should handle progress tracking', async () => {
      // Override axios function call
      (axios as any).mockReturnValueOnce(Promise.resolve({
        status: 200,
        headers: { 'content-length': '1000' },
        data: mockDataStream
      }));

      // Progress tracking mock
      const onProgressMock = jest.fn();      // Call downloadFile function with progress tracking
      const downloadPromise = downloadFile(
        'https://example.com/file.zip',
        '/path/to/destination.zip',
        { onProgress: onProgressMock }
      );

      // The problem is that the data events need to happen AFTER the axios call
      // has been processed inside downloadFile and the 'data' event listener has been attached
      setTimeout(() => {
        console.log('Debug - data event handlers attached:', mockDataStream.listeners('data').length);

        // Simulate data chunks coming in
        mockDataStream.emit('data', Buffer.from('a'.repeat(250)));
        mockDataStream.emit('data', Buffer.from('b'.repeat(250)));
        mockDataStream.emit('data', Buffer.from('c'.repeat(500)));

        console.log('Debug - onProgressMock was called:', onProgressMock.mock.calls.length, 'times');
      }, 10);

      // Simulate file stream completion with proper close callback execution
      setTimeout(() => {
        mockFileStream.emit('finish');
        // Simulate the callback being called after close
        mockFileStream.close.mock.calls[0][0]();
      }, 100);

      // Wait for the download to complete
      await downloadPromise;

      // Verify progress tracking
      expect(onProgressMock).toHaveBeenCalledTimes(3);
      expect(onProgressMock).toHaveBeenNthCalledWith(1, {
        bytesReceived: 250,
        totalBytes: 1000,
        percent: 25
      });
      expect(onProgressMock).toHaveBeenNthCalledWith(2, {
        bytesReceived: 500,
        totalBytes: 1000,
        percent: 50
      });
      expect(onProgressMock).toHaveBeenNthCalledWith(3, {
        bytesReceived: 1000,
        totalBytes: 1000,
        percent: 100
      });
    });

    test('should handle HTTP error status', async () => {
      // Setup file handling mocks
      mockFs.access.mockImplementation((path: string, mode: number, callback: (err: Error | null) => void) => {
        callback(null); // No error means file exists
      });

      mockFs.unlink.mockImplementation((path: string, callback: (err: Error | null) => void) => {
        callback(null); // No error means file was deleted
      });

      // Override axios function call with non-200 status
      (axios as any).mockReturnValueOnce(Promise.resolve({
        status: 404,
        statusText: 'Not Found'
      }));

      // Call downloadFile and expect it to reject
      await expect(downloadFile(
        'https://example.com/nonexistent.zip',
        '/path/to/destination.zip'
      )).rejects.toThrow('Failed to get \'https://example.com/nonexistent.zip\' (404)');

      // Verify fs.unlink was called to clean up
      expect(mockFs.unlink).toHaveBeenCalledWith(
        '/path/to/destination.zip',
        expect.any(Function)
      );
    });

    test('should handle network errors', async () => {
      // Setup file handling mocks
      mockFs.access.mockImplementation((path: string, mode: number, callback: (err: Error | null) => void) => {
        callback(null); // No error means file exists
      });

      mockFs.unlink.mockImplementation((path: string, callback: (err: Error | null) => void) => {
        callback(null); // No error means file was deleted
      });

      // Create an Axios error for network issues
      const networkError = new Error('Network Error');
      Object.defineProperty(networkError, 'isAxiosError', { value: true });

      // Override axios function call with rejection
      (axios as any).mockReturnValueOnce(Promise.reject(networkError));

      // Set up isAxiosError helper
      mockAxios.isAxiosError.mockReturnValue(true);

      // Call downloadFile and expect it to reject
      await expect(downloadFile(
        'https://example.com/file.zip',
        '/path/to/destination.zip'
      )).rejects.toThrow('Network Error');

      // Verify cleanup was performed
      expect(mockFs.unlink).toHaveBeenCalledWith(
        '/path/to/destination.zip',
        expect.any(Function)
      );
    });

    test('should handle timeout errors', async () => {
      // Setup file handling mocks
      mockFs.access.mockImplementation((path: string, mode: number, callback: (err: Error | null) => void) => {
        callback(null); // No error means file exists
      });

      mockFs.unlink.mockImplementation((path: string, callback: (err: Error | null) => void) => {
        callback(null); // No error means file was deleted
      });

      // Create an Axios error for timeout
      const timeoutError = new Error('Timeout');
      Object.defineProperty(timeoutError, 'isAxiosError', { value: true });
      Object.defineProperty(timeoutError, 'code', { value: 'ECONNABORTED' });

      // Override axios function call with rejection
      (axios as any).mockReturnValueOnce(Promise.reject(timeoutError));

      // Set up isAxiosError helper
      mockAxios.isAxiosError.mockReturnValue(true);

      // Call downloadFile with a custom timeout
      await expect(downloadFile(
        'https://example.com/file.zip',
        '/path/to/destination.zip',
        { timeout: 5000 }
      )).rejects.toThrow('Request timed out after 5000ms');

      // Verify timeout was set correctly
      expect(axios).toHaveBeenCalledWith(expect.objectContaining({
        timeout: 5000
      }));

      // Verify cleanup was performed
      expect(mockFs.unlink).toHaveBeenCalledWith(
        '/path/to/destination.zip',
        expect.any(Function)
      );
    });

    test('should handle aborted requests', async () => {
      // Setup file handling mocks
      mockFs.access.mockImplementation((path: string, mode: number, callback: (err: Error | null) => void) => {
        callback(null); // No error means file exists
      });

      mockFs.unlink.mockImplementation((path: string, callback: (err: Error | null) => void) => {
        callback(null); // No error means file was deleted
      });

      // Create an Axios error for abort
      const abortError = new Error('Request aborted');
      Object.defineProperty(abortError, 'isAxiosError', { value: true });
      Object.defineProperty(abortError, 'code', { value: 'ERR_CANCELED' });

      // Override axios function call with rejection
      (axios as any).mockReturnValueOnce(Promise.reject(abortError));

      // Set up isAxiosError helper
      mockAxios.isAxiosError.mockReturnValue(true);

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

      // Verify cleanup was performed
      expect(mockFs.unlink).toHaveBeenCalledWith(
        '/path/to/destination.zip',
        expect.any(Function)
      );
    });

    test('should handle file stream errors', async () => {
      // Setup file handling mocks
      mockFs.access.mockImplementation((path: string, mode: number, callback: (err: Error | null) => void) => {
        callback(null); // No error means file exists
      });

      mockFs.unlink.mockImplementation((path: string, callback: (err: Error | null) => void) => {
        callback(null); // No error means file was deleted
      });

      // Override axios function call
      (axios as any).mockReturnValueOnce(Promise.resolve({
        status: 200,
        headers: { 'content-length': '1024' },
        data: mockDataStream
      }));

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
      expect(mockFs.unlink).toHaveBeenCalledWith(
        '/path/to/destination.zip',
        expect.any(Function)
      );
    });
  });
});
