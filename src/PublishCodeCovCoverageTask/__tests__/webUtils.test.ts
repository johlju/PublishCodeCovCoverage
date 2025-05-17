import * as fs from 'node:fs';
import * as https from 'node:https';
import { downloadFile } from '../utils/webUtils';

jest.mock('node:fs');
jest.mock('node:https');

describe('webUtils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock console.log to keep test output clean
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  describe('downloadFile', () => {
    test('should download a file successfully', async () => {
      // Setup mocks
      const writeStream = {
        on: jest.fn().mockImplementation(function(this: any, event, handler) {
          if (event === 'finish') setTimeout(handler, 0);
          return this;
        }),
        close: jest.fn((cb) => cb())
      };
      const httpResponse = {
        statusCode: 200,
        pipe: jest.fn()
      };
      const httpRequest = {
        on: jest.fn().mockReturnThis()
      };

      // Setup mock implementations
      (fs.createWriteStream as jest.Mock).mockReturnValue(writeStream);
      (https.get as jest.Mock).mockImplementation((url, callback) => {
        callback(httpResponse);
        return httpRequest;
      });

      // Call the function
      await downloadFile('https://example.com/file', '/tmp/download');

      // Assertions
      expect(fs.createWriteStream).toHaveBeenCalledWith('/tmp/download');
      expect(https.get).toHaveBeenCalledWith('https://example.com/file', expect.any(Function));
      expect(httpResponse.pipe).toHaveBeenCalledWith(writeStream);
      expect(writeStream.on).toHaveBeenCalledWith('finish', expect.any(Function));
    });

    test('should reject on HTTP error status', async () => {
      // Setup mocks
      const httpResponse = { statusCode: 404 };

      // Setup mock implementations
      (https.get as jest.Mock).mockImplementation((url, callback) => {
        callback(httpResponse);
        return { on: jest.fn() };
      });

      // Call and assert
      await expect(downloadFile('https://example.com/file', '/tmp/download'))
        .rejects.toThrow('Failed to get');
    });

    test('should reject on file error', async () => {
      // Setup mocks
      const writeStream = {
        on: jest.fn().mockImplementation(function(this: any, event, handler) {
          if (event === 'error') setTimeout(() => handler(new Error('File error')), 0);
          return this;
        }),
        close: jest.fn()
      };
      const httpResponse = {
        statusCode: 200,
        pipe: jest.fn()
      };

      // Setup mock implementations
      (fs.createWriteStream as jest.Mock).mockReturnValue(writeStream);
      (https.get as jest.Mock).mockImplementation((url, callback) => {
        callback(httpResponse);
        return { on: jest.fn() };
      });
      jest.spyOn(fs, 'unlink').mockImplementation((path: fs.PathLike, callback: fs.NoParamCallback) => {
        callback(null);
        return undefined as any;
      });

      // Call and assert
      await expect(downloadFile('https://example.com/file', '/tmp/download'))
        .rejects.toThrow('File error');
      expect(fs.unlink).toHaveBeenCalled();
    });

    test('should reject on request error', async () => {
      // Setup mocks
      const httpRequest = {
        on: jest.fn().mockImplementation(function(this: any, event, handler) {
          if (event === 'error') setTimeout(() => handler(new Error('Request error')), 0);
          return this;
        })
      };

      // Setup mock implementations
      (https.get as jest.Mock).mockReturnValue(httpRequest);
      jest.spyOn(fs, 'unlink').mockImplementation((path: fs.PathLike, callback: fs.NoParamCallback) => {
        callback(null);
        return undefined as any;
      });

      // Call and assert
      await expect(downloadFile('https://example.com/file', '/tmp/download'))
        .rejects.toThrow('Request error');
      expect(fs.unlink).toHaveBeenCalled();
    });

    test('should return a promise', async () => {
      // Setup minimal mocks for this test
      const mockWriteStream = {
        on: jest.fn().mockImplementation(function(this: any, event, handler) {
          if (event === 'finish') setTimeout(() => handler(), 0);
          return this;
        }),
        close: jest.fn((cb) => cb())
      };

      (fs.createWriteStream as jest.Mock).mockReturnValue(mockWriteStream);
      (https.get as jest.Mock).mockImplementation((url, callback) => {
        callback({ statusCode: 200, pipe: jest.fn() });
        return { on: jest.fn() };
      });

      // Call and assert
      const result = downloadFile('https://example.com/file', '/tmp/download');
      expect(result).toBeInstanceOf(Promise);
      await result;
    }, 10000);
  });
});
