// filepath: /Users/johlju/source/PublishCodeCovCoverage/src/PublishCodeCovCoverageTask/__tests__/index.new-test.ts
import * as tl from 'azure-pipelines-task-lib/task';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import { execSync } from 'child_process';

// Mock dependencies
jest.mock('azure-pipelines-task-lib/task');
jest.mock('path');
jest.mock('child_process');
jest.mock('https');
jest.mock('fs');

// Import functions after mocking dependencies
import { run, downloadFile } from '../index';

describe('PublishCodeCovCoverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Suppress console output
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    // Mock task lib
    (tl.getInput as jest.Mock).mockImplementation((name: string) => {
      if (name === 'buildFolderName') return 'build';
      if (name === 'testResultFolderName') return 'testResults';
      return '';
    });

    (tl.getVariable as jest.Mock).mockImplementation((name: string) => {
      if (name === 'CODECOV_TOKEN') return 'mock-token';
      if (name === 'Agent.TempDirectory') return '/tmp';
      return undefined;
    });

    (tl.setResourcePath as jest.Mock).mockImplementation(() => {});
    (tl.setResult as jest.Mock).mockImplementation(() => {});

    // Mock TaskResult enum
    (tl.TaskResult as any) = {
      Succeeded: 0,
      Failed: 2
    };

    // Mock file system
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {});
    (fs.chmodSync as jest.Mock).mockImplementation(() => {});

    // Mock file stream
    const mockStream = {
      on: jest.fn().mockImplementation((event, handler) => {
        if (event === 'finish') {
          setTimeout(() => handler(), 0);
        }
        return mockStream;
      }),
      close: jest.fn().mockImplementation((callback) => {
        if (callback) callback();
      })
    };
    (fs.createWriteStream as jest.Mock).mockReturnValue(mockStream);

    // Mock fs.unlink
    jest.spyOn(fs, 'unlink').mockImplementation((path: fs.PathLike, callback: fs.NoParamCallback) => {
      callback(null);
      return undefined as any;
    });

    // Mock path
    (path.join as jest.Mock).mockImplementation((...args: string[]) => args.join('/'));

    // Mock execSync
    (execSync as jest.Mock).mockReturnValue('');

    // Mock process
    jest.spyOn(process, 'chdir').mockImplementation(() => {});
    process.env = { CODECOV_TOKEN: 'mock-token', CODECOV_URL: 'https://codecov.io' };

    // Mock https.get
    const mockResponse = {
      statusCode: 200,
      pipe: jest.fn().mockImplementation(() => mockResponse),
      on: jest.fn().mockImplementation((event, handler) => {
        if (event === 'finish') {
          setTimeout(() => handler(), 0);
        }
        return mockResponse;
      })
    };

    const mockRequest = {
      on: jest.fn().mockImplementation((event, handler) => {
        return mockRequest;
      })
    };

    (https.get as jest.Mock).mockImplementation((url, callback) => {
      callback(mockResponse);
      return mockRequest;
    });
  });

  test('run function should complete successfully', async () => {
    await run();

    expect(tl.setResult).toHaveBeenCalledWith(
      tl.TaskResult.Succeeded,
      'Code coverage uploaded successfully'
    );
  });

  test('run function should handle missing token', async () => {
    // Mock CODECOV_TOKEN as undefined
    (tl.getVariable as jest.Mock).mockReturnValueOnce(undefined);
    delete process.env.CODECOV_TOKEN;

    await run();

    expect(tl.setResult).toHaveBeenCalledWith(
      tl.TaskResult.Failed,
      'CODECOV_TOKEN environment variable is not set'
    );
  });

  test('run function should create directory if it does not exist', async () => {
    // Mock directory not existing
    (fs.existsSync as jest.Mock).mockImplementation((filePath: string) => {
      if (filePath === '/tmp/codecov_uploader') return false;
      return true;
    });

    await run();

    expect(fs.mkdirSync).toHaveBeenCalledWith('/tmp/codecov_uploader', { recursive: true });
  });

  test('run function should handle HTTP errors', async () => {
    // Setup HTTPS mock with error response
    const mockErrorResponse = {
      statusCode: 404,
      pipe: jest.fn(),
      on: jest.fn()
    };

    (https.get as jest.Mock).mockImplementation((url, callback) => {
      callback(mockErrorResponse);
      return { on: jest.fn() };
    });

    await run();

    expect(tl.setResult).toHaveBeenCalledWith(
      tl.TaskResult.Failed,
      expect.stringContaining('Failed to get')
    );
  });

  test('run function should handle network errors', async () => {
    // Setup HTTPS mock with network error
    const mockRequest = {
      on: jest.fn().mockImplementation((event, handler) => {
        if (event === 'error') {
          handler(new Error('Network error'));
        }
        return mockRequest;
      })
    };

    (https.get as jest.Mock).mockReturnValue(mockRequest);

    await run();

    expect(tl.setResult).toHaveBeenCalledWith(
      tl.TaskResult.Failed,
      expect.stringContaining('Network error')
    );
  });

  test('downloadFile function should return a promise', async () => {
    const promise = downloadFile('https://example.com/file', 'dest-file');
    expect(promise).toBeInstanceOf(Promise);
    await promise;
  });

  test('downloadFile function should handle HTTP error status codes', async () => {
    // Setup HTTPS mock with error response
    const mockErrorResponse = {
      statusCode: 404,
      pipe: jest.fn(),
      on: jest.fn()
    };

    (https.get as jest.Mock).mockImplementation((url, callback) => {
      callback(mockErrorResponse);
      return { on: jest.fn() };
    });

    await expect(downloadFile('https://example.com/file', 'dest-file'))
      .rejects
      .toThrow('Failed to get');
  });
});
