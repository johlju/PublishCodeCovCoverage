import * as tl from 'azure-pipelines-task-lib/task';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import { execSync } from 'child_process';

// Import directly from module - no need for getIndexModule helper
import { run, downloadFile } from '../index';

// Mock all dependencies
jest.mock('azure-pipelines-task-lib/task');
jest.mock('path');
jest.mock('child_process');
jest.mock('https');
jest.mock('fs');

describe('PublishCodeCovCoverage', () => {
  let mockWriteStream: any;
  let mockHttpsResponse: any;
  let mockHttpsRequest: any;

  // Set up before each test
  beforeEach(() => {
    jest.clearAllMocks();

    // Suppress console output
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    // Mock tl methods
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
    tl.TaskResult = {
      Succeeded: 0,
      Failed: 2
    } as any;

    // Mock path.join
    (path.join as jest.Mock).mockImplementation((...args: string[]) => args.join('/'));

    // Mock fs methods
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {});
    (fs.chmodSync as jest.Mock).mockImplementation(() => {});

    // Create a mock writeStream that emulates file operations
    mockWriteStream = {
      on: jest.fn().mockImplementation((event, handler) => {
        if (event === 'finish') {
          setTimeout(() => handler(), 0);
        }
        return mockWriteStream;
      }),
      close: jest.fn().mockImplementation((callback) => {
        if (callback) callback();
      })
    };

    (fs.createWriteStream as jest.Mock).mockReturnValue(mockWriteStream);

    // Handle fs.unlink mock more safely
    const unlinkMock = (path: fs.PathLike, callback: fs.NoParamCallback) => {
      callback(null);
    };
    jest.spyOn(fs, 'unlink').mockImplementation(unlinkMock as any);

    // Mock execSync
    (execSync as jest.Mock).mockReturnValue('');

    // Mock process methods
    jest.spyOn(process, 'chdir').mockImplementation(() => {});

    // Set up process.env
    process.env = {
      CODECOV_TOKEN: 'mock-token',
      CODECOV_URL: 'https://codecov.io'
    };

    // Create mock HTTPS response and request
    mockHttpsResponse = {
      statusCode: 200,
      pipe: jest.fn().mockImplementation(() => mockHttpsResponse),
      on: jest.fn().mockImplementation((event, handler) => {
        if (event === 'finish') {
          setTimeout(() => handler(), 0);
        }
        return mockHttpsResponse;
      })
    };

    mockHttpsRequest = {
      on: jest.fn().mockImplementation((event, handler) => {
        return mockHttpsRequest;
      })
    };

    // Mock https.get
    (https.get as jest.Mock).mockImplementation((url, callback) => {
      callback(mockHttpsResponse);
      return mockHttpsRequest;
    });
  });

  afterEach(() => {
    jest.resetModules();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  test('run function should complete successfully', async () => {
    // Get the run function
    const indexModule = getIndexModule();

    // Call and wait for the run function to complete
    await indexModule.run();

    // Assert that task completed successfully
    expect(tl.setResult).toHaveBeenCalledWith(
      tl.TaskResult.Succeeded,
      'Code coverage uploaded successfully'
    );
  });

  test('run function should handle missing token', async () => {
    // Mock CODECOV_TOKEN as undefined
    (tl.getVariable as jest.Mock).mockReturnValue(undefined);
    delete process.env.CODECOV_TOKEN;

    // Get the run function
    const indexModule = getIndexModule();

    // Call and wait for the run function to complete
    await indexModule.run();

    // Assert that task failed with expected error message
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

    // Get the run function
    const indexModule = getIndexModule();

    // Call and wait for the run function to complete
    await indexModule.run();

    // Assert directory was created
    expect(fs.mkdirSync).toHaveBeenCalledWith('/tmp/codecov_uploader', { recursive: true });
  });

  test('run function should handle HTTP errors', async () => {
    // Setup HTTPS mock with error response
    (https.get as jest.Mock).mockImplementation((url: string, callback: Function) => {
      const mockResponse = {
        statusCode: 404,
        pipe: jest.fn(),
        on: jest.fn()
      };

      callback(mockResponse);

      return {
        on: jest.fn()
      };
    });

    // Get the run function
    const indexModule = getIndexModule();

    // Call and wait for the run function to complete - should throw or handle error
    await indexModule.run();

    // Assert that task failed
    expect(tl.setResult).toHaveBeenCalledWith(
      tl.TaskResult.Failed,
      expect.stringContaining('Failed to get')
    );
  });

  test('run function should handle network errors', async () => {
    // Setup HTTPS mock with network error
    (https.get as jest.Mock).mockImplementation((_url: string, _callback: Function) => {
      return {
        on: jest.fn().mockImplementation((event: string, handler: Function) => {
          if (event === 'error') {
            handler(new Error('Network error'));
          }
          return {};
        })
      };
    });

    // Get the run function
    const indexModule = getIndexModule();

    // Call and wait for the run function to complete
    await indexModule.run();

    // Assert that task failed
    expect(tl.setResult).toHaveBeenCalledWith(
      tl.TaskResult.Failed,
      expect.stringContaining('Network error')
    );
  });

  test('downloadFile function should return a promise', async () => {
    // Get the downloadFile function
    const indexModule = getIndexModule();

    // Call the function and verify it returns a Promise
    const promise = indexModule.downloadFile('https://example.com/file', 'dest-file');
    expect(promise).toBeInstanceOf(Promise);

    // Wait for the promise to complete
    await promise;
  });

  test('downloadFile function should handle HTTP error status codes', async () => {
    // Setup HTTPS mock with error response
    (https.get as jest.Mock).mockImplementation((url: string, callback: Function) => {
      const mockResponse = {
        statusCode: 404,
        pipe: jest.fn(),
        on: jest.fn()
      };

      callback(mockResponse);

      return {
        on: jest.fn()
      };
    });

    // Get the downloadFile function
    const indexModule = getIndexModule();

    // Call function and expect it to reject with error
    await expect(indexModule.downloadFile('https://example.com/file', 'dest-file'))
      .rejects
      .toThrow('Failed to get');
  });
});
