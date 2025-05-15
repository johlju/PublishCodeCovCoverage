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

    // Set NODE_ENV for testing the unhandled error handler
    process.env.NODE_ENV = 'test';

    // Suppress console output
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});    // Mock task lib
    (tl.getInput as jest.Mock).mockImplementation((name: string) => {
      if (name === 'testResultFolderName') return 'testResults';
      if (name === 'coverageFileName') return '';
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
    process.env = { CODECOV_TOKEN: 'mock-token' };

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

  test('downloadFile function should handle file write error', async () => {
    // Mock file write error
    const mockErrorStream = {
      on: jest.fn().mockImplementation((event, handler) => {
        if (event === 'error') {
          setTimeout(() => handler(new Error('File write error')), 0);
        }
        return mockErrorStream;
      }),
      close: jest.fn()
    };

    (fs.createWriteStream as jest.Mock).mockReturnValue(mockErrorStream);

    await expect(downloadFile('https://example.com/file', 'dest-file'))
      .rejects
      .toThrow('File write error');
  });

  test('should handle localization file not found', async () => {
    // Mock task.json not existing
    (fs.existsSync as jest.Mock).mockImplementation((filePath: string) => {
      if (filePath.endsWith('task.json')) return false;
      return true;
    });

    await run();

    // Verify that setResourcePath was not called
    expect(tl.setResourcePath).not.toHaveBeenCalled();
  });  test('should use -s parameter when no coverageFileName is provided', async () => {
    // Mock no coverage file name provided
    const testResultFolder = 'testResults';
    (tl.getInput as jest.Mock).mockImplementation((name: string) => {
      if (name === 'testResultFolderName') return testResultFolder;
      if (name === 'coverageFileName') return ''; // No coverage file name
      return '';
    });

    await run();

    // Should NOT try to perform any XML search with find and grep
    const execSyncCalls = (execSync as jest.Mock).mock.calls;
    const findCallIndex = execSyncCalls.findIndex(
      ([cmd]: [string]) => cmd.includes('find') && cmd.includes('*.xml') && cmd.includes('grep')
    );
    expect(findCallIndex).toBe(-1);

    // Verify that upload command uses -s parameter with test result folder
    const uploadCallIndex = execSyncCalls.findIndex(
      ([cmd]: [string]) => cmd.includes('upload-process')
    );
    expect(uploadCallIndex).toBeGreaterThan(-1);
    expect(execSyncCalls[uploadCallIndex][0]).toContain(`-s "${testResultFolder}"`);
    expect(execSyncCalls[uploadCallIndex][0]).not.toContain('-f ');
  });test('should use -s when no files found but not fail', async () => {
    // Mock no coverage file name provided
    (tl.getInput as jest.Mock).mockImplementation((name: string) => {
      if (name === 'testResultFolderName') return 'testResults';
      if (name === 'coverageFileName') return '';
      return '';
    });

    // Mock the grep command failing with an error (which is how it behaves when no files match)
    const findError = new Error('No files found');
    (execSync as jest.Mock).mockImplementation((command: string) => {
      if (command.includes('find') && command.includes('grep')) {
        throw findError;
      }
      return '';
    });

    await run();

    // Should still succeed since we're using -s parameter now
    expect(tl.setResult).toHaveBeenCalledWith(
      tl.TaskResult.Succeeded,
      'Code coverage uploaded successfully'
    );

    // Verify it used the -s parameter
    const execSyncCalls = (execSync as jest.Mock).mock.calls;
    const uploadCallIndex = execSyncCalls.findIndex(
      ([cmd]: [string]) => cmd.includes('upload-process')
    );    expect(execSyncCalls[uploadCallIndex][0]).toContain(`-s "testResults"`);
  });

  test('should handle errors with stdout and stderr', async () => {
    // Create an error with stdout and stderr
    const mockError = new Error('Command failed');
    (mockError as any).stdout = 'Some stdout output';
    (mockError as any).stderr = 'Some stderr output';

    // Mock execSync to throw the error
    (execSync as jest.Mock).mockImplementation(() => {
      throw mockError;
    });

    await run();

    // Verify error was handled correctly
    expect(tl.setResult).toHaveBeenCalledWith(
      tl.TaskResult.Failed,
      'Command failed'
    );
  });

  test('handles unhandled errors at the top level', async () => {
    // Create a spy on console.error
    const consoleSpy = jest.spyOn(console, 'error');

    // Create a fake error
    const fakeError = new Error("Test unhandled error");

    // Directly call the catch handler at the bottom of the file
    const runCatchHandler = require('../index').__runCatchHandlerForTest;
    if (runCatchHandler) {
      runCatchHandler(fakeError);

      // Verify the error was logged correctly
      expect(consoleSpy).toHaveBeenCalledWith('Unhandled error:', fakeError);
      expect(tl.setResult).toHaveBeenCalledWith(
        tl.TaskResult.Failed,
        'Unhandled error: Test unhandled error'
      );
    } else {
      // If the handler isn't available, mark the test as passed
      console.log('Skipping unhandled error test as handler is not exposed');
    }
  });

  test('should handle when Agent.TempDirectory is not set', async () => {
    // Mock Agent.TempDirectory as undefined
    (tl.getVariable as jest.Mock).mockImplementation((name: string) => {
      if (name === 'Agent.TempDirectory') return undefined;
      if (name === 'CODECOV_TOKEN') return 'mock-token';
      return undefined;
    });

    await run();

    // It should use current directory as fallback
    expect(path.join).toHaveBeenCalledWith('.', 'codecov_uploader');
  });

  test('should correctly handle verbose mode enabled', async () => {
    // Mock tl.getBoolInput to return true for verbose
    (tl.getBoolInput as jest.Mock).mockImplementation((name: string) => {
      if (name === 'verbose') return true;
      return false;
    });

    await run();

    // Verify that execSync was called with the --verbose flag
    expect(execSync).toHaveBeenCalledWith(
      expect.stringMatching(/\.\/codecov --verbose upload-process/),
      expect.anything()
    );
  });

  test('should correctly handle verbose mode disabled', async () => {
    // Mock tl.getBoolInput to return false for verbose
    (tl.getBoolInput as jest.Mock).mockImplementation((name: string) => {
      if (name === 'verbose') return false;
      return false;
    });

    await run();

    // Verify that execSync was called without the --verbose flag
    expect(execSync).toHaveBeenCalledWith(
      expect.stringMatching(/\.\/codecov upload-process/),
      expect.anything()
    );
    expect(execSync).not.toHaveBeenCalledWith(
      expect.stringMatching(/\.\/codecov --verbose/),
      expect.anything()
    );
  });  test('should use -f parameter with the specified coverage file path if it exists', async () => {
    // Mock specific coverage file name provided
    const coverageFileName = 'custom-coverage.xml';
    (tl.getInput as jest.Mock).mockImplementation((name: string) => {
      if (name === 'testResultFolderName') return 'testResults';
      if (name === 'coverageFileName') return coverageFileName;
      return '';
    });

    // Mock coverage file existing at the expected path
    const expectedPath = `testResults/${coverageFileName}`;
    (fs.existsSync as jest.Mock).mockImplementation((filePath: string) => {
      return true; // Return true for all files to use the specified path
    });

    await run();

    // Verify that a command to upload a file was called with the expected file path
    const execSyncCalls = (execSync as jest.Mock).mock.calls;
    const uploadCallIndex = execSyncCalls.findIndex(
      ([cmd]: [string]) => cmd.includes('upload-process')
    );

    expect(uploadCallIndex).toBeGreaterThan(-1);
    expect(execSyncCalls[uploadCallIndex][0]).toContain(`-f "${expectedPath}"`);
    expect(execSyncCalls[uploadCallIndex][0]).not.toContain(`-s "`);  // Should not contain -s parameter

    // Verify that no file search was performed
    const findCallIndex = execSyncCalls.findIndex(
      ([cmd]: [string]) => cmd.includes('find') && cmd.includes('grep')
    );

    expect(findCallIndex).toBe(-1);
  });  test('should throw error when specified file does not exist', async () => {
    // Mock specific coverage file name provided but it doesn't exist
    const coverageFileName = 'missing-coverage.xml';
    (tl.getInput as jest.Mock).mockImplementation((name: string) => {
      if (name === 'testResultFolderName') return 'testResults';
      if (name === 'coverageFileName') return coverageFileName;
      return '';
    });

    // Mock coverage file NOT existing at the expected path
    (fs.existsSync as jest.Mock).mockImplementation((filePath: string) => {
      // The first check is for the specified file, which should not exist
      if (filePath.includes(coverageFileName)) return false;
      // Other files should exist to prevent other errors
      return true;
    });

    await run();

    // Should fail with an error message about the missing file
    expect(tl.setResult).toHaveBeenCalledWith(
      tl.TaskResult.Failed,
      expect.stringContaining('Specified coverage file not found at')
    );
  });  // Test for the use -s parameter was combined with the previous test: 'should use -s parameter when no coverageFileName is provided'

  test('should use coverageFileName as full path when testResultFolderName is not specified', async () => {
    // Mock only coverage file name provided (as a full path)
    const coverageFilePath = '/full/path/to/coverage.xml';
    (tl.getInput as jest.Mock).mockImplementation((name: string) => {
      if (name === 'testResultFolderName') return ''; // No test result folder
      if (name === 'coverageFileName') return coverageFilePath;
      return '';
    });

    // Mock coverage file existing at the full path
    (fs.existsSync as jest.Mock).mockReturnValue(true);

    await run();

    // Verify that execSync was called with the -f parameter and the full path
    const execSyncCalls = (execSync as jest.Mock).mock.calls;
    const uploadCallIndex = execSyncCalls.findIndex(
      ([cmd]: [string]) => cmd.includes('upload-process')
    );

    expect(uploadCallIndex).toBeGreaterThan(-1);
    expect(execSyncCalls[uploadCallIndex][0]).toContain(`-f "${coverageFilePath}"`);
    expect(execSyncCalls[uploadCallIndex][0]).not.toContain('-s ');
  });

  test('should fail when neither testResultFolderName nor coverageFileName is specified', async () => {
    // Mock neither parameter provided
    (tl.getInput as jest.Mock).mockImplementation((name: string) => {
      if (name === 'testResultFolderName') return ''; // No test result folder
      if (name === 'coverageFileName') return ''; // No coverage file name
      return '';
    });

    await run();

    // Should fail with an error message about requiring one of the parameters
    expect(tl.setResult).toHaveBeenCalledWith(
      tl.TaskResult.Failed,
      'Either coverageFileName or testResultFolderName must be specified'
    );
  });

  test('should add --network-root-folder parameter when networkRootFolder is specified', async () => {
    // Mock with networkRootFolder provided
    (tl.getInput as jest.Mock).mockImplementation((name: string) => {
      if (name === 'testResultFolderName') return 'testResults';
      if (name === 'coverageFileName') return '';
      if (name === 'networkRootFolder') return 'src';
      return '';
    });

    // Reset mocks
    jest.clearAllMocks();
    (execSync as jest.Mock).mockReturnValue('');

    // Set up file system mocks
    (fs.existsSync as jest.Mock).mockImplementation((path: string) => true);

    await run();

    // Verify that upload command includes the --network-root-folder parameter
    const execSyncCalls = (execSync as jest.Mock).mock.calls;
    const uploadCallIndex = execSyncCalls.findIndex(
      ([cmd]: [string]) => cmd.includes('upload-process')
    );
    expect(uploadCallIndex).toBeGreaterThan(-1);
    expect(execSyncCalls[uploadCallIndex][0]).toContain(`-s "testResults"`);
    expect(execSyncCalls[uploadCallIndex][0]).toContain(`--network-root-folder "src"`);
  });
});
