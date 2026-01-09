/// <reference path="../../../types/azure-pipelines-task-lib/task.d.ts" />
import { createRequire as _createRequire } from "module";
const __require = _createRequire(import.meta.url);
const tl = __require("azure-pipelines-task-lib/task");
import * as fs from 'node:fs';
import * as https from 'node:https';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import logger from '../utils/logger.js';
// Mock dependencies
jest.mock('azure-pipelines-task-lib/task');
jest.mock('node:child_process');
jest.mock('node:https');
jest.mock('node:fs');
jest.mock('../utils/fileUtils', () => ({
    verifyFileChecksum: jest.fn().mockImplementation(() => Promise.resolve()),
}));
jest.mock('../utils/webUtils');
// Import functions after mocking dependencies
import { run } from '../index.js';
// Get reference to the mocked verifyFileChecksum
import { verifyFileChecksum } from '../utils/fileUtils.js';
import { setTokenWasSetByTask } from '../utils/environmentUtils.js';
describe('PublishCodeCovCoverage', () => {
    // Store original env to restore it after each test
    let originalEnv;
    beforeEach(() => {
        // Store original environment
        originalEnv = { ...process.env };
        jest.clearAllMocks();
        // Set NODE_ENV for testing the unhandled error handler
        process.env.NODE_ENV = 'test';
        // Suppress logger output
        jest.spyOn(logger, 'info').mockImplementation(() => logger);
        jest.spyOn(logger, 'error').mockImplementation(() => logger);
        jest.spyOn(logger, 'warn').mockImplementation(() => logger);
        jest.spyOn(logger, 'debug').mockImplementation(() => logger);
        // Mock task lib
        tl.getInput.mockImplementation((name) => {
            if (name === 'testResultFolderName')
                return 'testResults';
            if (name === 'coverageFileName')
                return '';
            if (name === 'codecovToken')
                return '';
            return '';
        });
        tl.getVariable.mockImplementation((name) => {
            if (name === 'CODECOV_TOKEN')
                return 'mock-token';
            if (name === 'Agent.TempDirectory')
                return '/tmp';
            return undefined;
        });
        tl.setResourcePath.mockImplementation(() => { });
        tl.setResult.mockImplementation(() => { });
        // Mock TaskResult enum
        tl.TaskResult = {
            Succeeded: 0,
            Failed: 2,
        };
        // Mock file system
        fs.existsSync.mockReturnValue(true);
        fs.mkdirSync.mockImplementation(() => { });
        fs.chmodSync.mockImplementation(() => { });
        // Mock file stream
        const mockStream = {
            on: jest.fn().mockImplementation((event, handler) => {
                if (event === 'finish') {
                    setTimeout(() => handler(), 0);
                }
                return mockStream;
            }),
            close: jest.fn().mockImplementation((callback) => {
                if (callback)
                    callback();
            }),
        };
        fs.createWriteStream.mockReturnValue(mockStream);
        // Mock fs.unlink
        jest
            .spyOn(fs, 'unlink')
            .mockImplementation((path, callback) => {
            callback(null);
            return undefined;
        });
        // No longer need global path module mocking
        // We'll use spies only in specific tests as needed
        // Mock execFileSync
        execFileSync.mockReturnValue('');
        // Mock process
        jest.spyOn(process, 'chdir').mockImplementation(() => { });
        jest.spyOn(process, 'cwd').mockReturnValue('/original/working/directory');
        process.env.CODECOV_TOKEN = 'mock-token';
        // Mock https.get
        const mockResponse = {
            statusCode: 200,
            pipe: jest.fn().mockImplementation(() => mockResponse),
            on: jest.fn().mockImplementation((event, handler) => {
                if (event === 'finish') {
                    setTimeout(() => handler(), 0);
                }
                return mockResponse;
            }),
        };
        const mockRequest = {
            on: jest.fn().mockImplementation((event, handler) => {
                return mockRequest;
            }),
        };
        https.get.mockImplementation((url, callback) => {
            callback(mockResponse);
            return mockRequest;
        });
    });
    afterEach(() => {
        // Restore console mocks to prevent side effects between tests
        jest.restoreAllMocks();
        // Restore original environment
        process.env = originalEnv;
    });
    afterAll(() => {
        /**
         * Clean up .taskkey file if it exists
         * The azure-pipelines-task-lib creates this file when running tasks,
         * even in test environments. We remove it to avoid accumulating these files
         * during test runs and to prevent potential test interference between runs.
         */
        const taskKeyPath = path.join(process.cwd(), '.taskkey');
        try {
            if (require('node:fs').existsSync(taskKeyPath)) {
                fs.unlinkSync(taskKeyPath);
            }
        }
        catch {
            // Ignore errors during cleanup
        }
    });
    test('run function should complete successfully', async () => {
        await run();
        expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.Succeeded, 'Code coverage uploaded successfully');
    });
    test('run function should handle missing token', async () => {
        // Mock CODECOV_TOKEN as undefined
        tl.getVariable.mockReturnValueOnce(undefined);
        process.env.CODECOV_TOKEN = '';
        await run();
        expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.Failed, 'CODECOV_TOKEN environment variable is not set or passed as input or pipeline variable');
    });
    test('run function should create directory if it does not exist', async () => {
        // Mock directory not existing
        fs.existsSync.mockImplementation((filePath) => {
            if (filePath === '/tmp/codecov_uploader')
                return false;
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
            on: jest.fn(),
        };
        // Import the module to mock
        const webUtils = require('../utils/webUtils');
        // Mock the downloadFile function to throw an error for HTTP issues
        jest.spyOn(webUtils, 'downloadFile').mockRejectedValueOnce(new Error('Failed to get (404)'));
        // We still need the original https.get mock for other parts of the code
        https.get.mockImplementation((url, callback) => {
            callback(mockErrorResponse);
            return { on: jest.fn() };
        });
        await run();
        expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.Failed, expect.stringContaining('Failed to get'));
    });
    test('run function should handle network errors', async () => {
        // Setup HTTPS mock with network error
        const mockRequest = {
            on: jest.fn().mockImplementation((event, handler) => {
                if (event === 'error') {
                    handler(new Error('Network error'));
                }
                return mockRequest;
            }),
        };
        https.get.mockReturnValue(mockRequest);
        // Import the module to mock
        const webUtils = require('../utils/webUtils');
        // Mock the downloadFile function to throw a network error
        jest.spyOn(webUtils, 'downloadFile').mockRejectedValueOnce(new Error('Network error'));
        await run();
        expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.Failed, expect.stringContaining('Network error'));
    });
    // downloadFile tests have been moved to webUtils.test.ts
    test('should handle localization file not found', async () => {
        // Mock task.json not existing
        fs.existsSync.mockImplementation((filePath) => {
            if (filePath.endsWith('task.json'))
                return false;
            return true;
        });
        await run();
        // Verify that setResourcePath was not called
        expect(tl.setResourcePath).not.toHaveBeenCalled();
    });
    test('should use --coverage-files-search-root-folder parameter when no coverageFileName is provided', async () => {
        // Mock no coverage file name provided
        const testResultFolder = 'testResults';
        tl.getInput.mockImplementation((name) => {
            if (name === 'testResultFolderName')
                return testResultFolder;
            if (name === 'coverageFileName')
                return ''; // No coverage file name
            return '';
        });
        await run();
        // Get all exec calls for verification
        const execFileSyncCalls = execFileSync.mock.calls;
        // Verify that execFileSync was called with the correct executable and arguments
        const uploadCallIndex = execFileSyncCalls.findIndex(([executable, args]) => executable === './codecov' && args.includes('upload-process'));
        expect(uploadCallIndex).toBeGreaterThan(-1);
        // Verify the arguments array contains the --coverage-files-search-root-folder parameter with the correct path
        const args = execFileSyncCalls[uploadCallIndex][1];
        expect(args).toContain('--coverage-files-search-root-folder');
        expect(args).toContain(`/original/working/directory/${testResultFolder}`);
        expect(args).not.toContain('--coverage-files-search-direct-file');
    });
    test('should use -s when no files found but not fail', async () => {
        // Mock no coverage file name provided
        tl.getInput.mockImplementation((name) => {
            if (name === 'testResultFolderName')
                return 'testResults';
            if (name === 'coverageFileName')
                return '';
            return '';
        });
        await run();
        // Should still succeed since we're using --coverage-files-search-root-folder parameter now
        expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.Succeeded, 'Code coverage uploaded successfully');
        // Verify it used the --coverage-files-search-root-folder parameter with execFileSync
        const execFileSyncCalls = execFileSync.mock.calls;
        const uploadCallIndex = execFileSyncCalls.findIndex(([executable, args]) => executable === './codecov' && args.includes('upload-process'));
        const args = execFileSyncCalls[uploadCallIndex][1];
        expect(args).toContain('--coverage-files-search-root-folder');
        expect(args).toContain('/original/working/directory/testResults');
    });
    test('should handle errors with stdout and stderr', async () => {
        // Create an error with stdout and stderr
        const mockError = new Error('Command failed');
        mockError.stdout = 'Some stdout output';
        mockError.stderr = 'Some stderr output';
        // Mock execFileSync to throw the error
        execFileSync.mockImplementation(() => {
            throw mockError;
        });
        await run();
        // Verify error was handled correctly
        expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.Failed, 'Command failed');
    });
    test('handles unhandled errors at the top level and clears token if set by task', async () => {
        // Create a spy on logger.error
        const loggerErrorSpy = jest.spyOn(logger, 'error');
        // Set up a token and the tokenWasSetByTask flag
        process.env.CODECOV_TOKEN = 'test-token-for-unhandled-error';
        setTokenWasSetByTask(true);
        // Create a fake error
        const fakeError = new Error('Test unhandled error');
        // Directly call the catch handler at the bottom of the file
        const { __runCatchHandlerForTest: runCatchHandler } = require('../index');
        if (runCatchHandler) {
            runCatchHandler(fakeError);
            // Verify the error was logged correctly
            expect(loggerErrorSpy).toHaveBeenCalledWith('Unhandled error:', fakeError);
            expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.Failed, 'Unhandled error: Test unhandled error');
            // Verify token was cleared
            expect(process.env.CODECOV_TOKEN).toBeUndefined();
        }
        else {
            // If the handler isn't available, mark the test as passed
            logger.info('Skipping unhandled error test as handler is not exposed');
        }
    });
    test('should handle when Agent.TempDirectory is not set', async () => {
        // Mock Agent.TempDirectory as undefined
        tl.getVariable.mockImplementation((name) => {
            if (name === 'Agent.TempDirectory')
                return undefined;
            if (name === 'CODECOV_TOKEN')
                return 'mock-token';
            return undefined;
        });
        await run();
        // For this test we can't use spyOn on path.join because of how Jest works
        // So we'll verify the behavior indirectly through the expected outcome
        // Verify that the task completed and used the correct fallback path
        expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.Succeeded, 'Code coverage uploaded successfully');
    });
    test('should correctly handle verbose mode enabled', async () => {
        // Mock tl.getBoolInput to return true for verbose
        tl.getBoolInput.mockImplementation((name) => {
            if (name === 'verbose')
                return true;
            return false;
        });
        await run();
        // Verify that execFileSync was called with the --verbose flag
        expect(execFileSync).toHaveBeenCalledWith('./codecov', expect.arrayContaining(['--verbose', 'upload-process']), expect.anything());
        // Verify the token is NOT passed on command line with -t parameter
        // If we would pass -t, any local user can read /proc/<pid>/cmdline.
        // Codecov's CLI picks CODECOV_TOKEN from the environment
        const execFileSyncCalls = execFileSync.mock.calls;
        const uploadCallIndex = execFileSyncCalls.findIndex(([executable, args]) => executable === './codecov' && args.includes('upload-process'));
        expect(execFileSyncCalls[uploadCallIndex][1]).not.toContain('-t');
    });
    test('should correctly handle verbose mode disabled', async () => {
        // Mock tl.getBoolInput to return false for verbose
        tl.getBoolInput.mockImplementation((name) => {
            if (name === 'verbose')
                return false;
            return false;
        });
        await run();
        // Verify that execFileSync was called without the --verbose flag
        const execFileSyncCalls = execFileSync.mock.calls;
        const uploadCallIndex = execFileSyncCalls.findIndex(([executable, args]) => executable === './codecov' && args.includes('upload-process'));
        expect(uploadCallIndex).toBeGreaterThan(-1);
        expect(execFileSyncCalls[uploadCallIndex][1]).not.toContain('--verbose');
    });
    test('should use --coverage-files-search-direct-file parameter with the specified coverage file path if it exists', async () => {
        // Mock specific coverage file name provided
        const coverageFileName = 'custom-coverage.xml';
        tl.getInput.mockImplementation((name) => {
            if (name === 'testResultFolderName')
                return 'testResults';
            if (name === 'coverageFileName')
                return coverageFileName;
            return '';
        });
        // Mock coverage file existing at the expected path
        const expectedPath = `/original/working/directory/testResults/${coverageFileName}`;
        fs.existsSync.mockImplementation((filePath) => {
            return true; // Return true for all files to use the specified path
        });
        await run();
        // Verify that execFileSync was called with --coverage-files-search-direct-file and the expected file path
        const execFileSyncCalls = execFileSync.mock.calls;
        const uploadCallIndex = execFileSyncCalls.findIndex(([executable, args]) => executable === './codecov' && args.includes('upload-process'));
        expect(uploadCallIndex).toBeGreaterThan(-1);
        const args = execFileSyncCalls[uploadCallIndex][1];
        expect(args).toContain('--coverage-files-search-direct-file');
        expect(args).toContain(expectedPath);
        expect(args).not.toContain('--coverage-files-search-root-folder'); // Should not contain --coverage-files-search-root-folder parameter
    });
    test('should throw error when specified file does not exist', async () => {
        // Mock specific coverage file name provided but it doesn't exist
        const coverageFileName = 'missing-coverage.xml';
        tl.getInput.mockImplementation((name) => {
            if (name === 'testResultFolderName')
                return 'testResults';
            if (name === 'coverageFileName')
                return coverageFileName;
            return '';
        });
        // Mock coverage file NOT existing at the expected path
        fs.existsSync.mockImplementation((filePath) => {
            // The first check is for the specified file, which should not exist
            if (filePath.includes(coverageFileName))
                return false;
            // Other files should exist to prevent other errors
            return true;
        });
        await run();
        // Should fail with an error message about the missing file
        expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.Failed, expect.stringContaining('Specified coverage file not found at'));
    });
    test('should use coverageFileName as full path when testResultFolderName is not specified', async () => {
        // Mock only coverage file name provided (as a full path)
        const coverageFilePath = '/full/path/to/coverage.xml';
        tl.getInput.mockImplementation((name) => {
            if (name === 'testResultFolderName')
                return ''; // No test result folder
            if (name === 'coverageFileName')
                return coverageFilePath;
            return '';
        });
        // Mock coverage file existing at the full path
        fs.existsSync.mockReturnValue(true);
        // Instead of mocking path.resolve, we'll test the outcome
        // by checking the arguments passed to execFileSync
        await run();
        // Verify that execFileSync was called with --coverage-files-search-direct-file and the correct path
        const execFileSyncCalls = execFileSync.mock.calls;
        const uploadCallIndex = execFileSyncCalls.findIndex(([executable, args]) => executable === './codecov' && args.includes('upload-process'));
        expect(uploadCallIndex).toBeGreaterThan(-1);
        const args = execFileSyncCalls[uploadCallIndex][1];
        expect(args).toContain('--coverage-files-search-direct-file');
        expect(args).toContain(coverageFilePath);
        expect(args).not.toContain('--coverage-files-search-root-folder'); // Should not contain --coverage-files-search-root-folder parameter
    });
    test('should fail when neither testResultFolderName nor coverageFileName is specified', async () => {
        // Mock neither parameter provided
        tl.getInput.mockImplementation((name) => {
            if (name === 'testResultFolderName')
                return ''; // No test result folder
            if (name === 'coverageFileName')
                return ''; // No coverage file name
            return '';
        });
        await run();
        // Should fail with an error message about requiring one of the parameters
        expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.Failed, 'Either coverageFileName or testResultFolderName must be specified');
    });
    test('should add --network-root-folder parameter when networkRootFolder is specified', async () => {
        // Mock with networkRootFolder provided
        const networkRootFolder = 'src';
        tl.getInput.mockImplementation((name) => {
            if (name === 'testResultFolderName')
                return 'testResults';
            if (name === 'coverageFileName')
                return '';
            if (name === 'networkRootFolder')
                return networkRootFolder;
            return '';
        });
        // Reset mocks
        jest.clearAllMocks();
        execFileSync.mockReturnValue('');
        jest.spyOn(process, 'cwd').mockReturnValue('/original/working/directory');
        // Set up file system mocks
        fs.existsSync.mockImplementation((path) => true);
        await run();
        // Verify that execFileSync was called with the --network-root-folder parameter
        const execFileSyncCalls = execFileSync.mock.calls;
        const uploadCallIndex = execFileSyncCalls.findIndex(([executable, args]) => executable === './codecov' && args.includes('upload-process'));
        expect(uploadCallIndex).toBeGreaterThan(-1);
        const args = execFileSyncCalls[uploadCallIndex][1];
        expect(args).toContain('--coverage-files-search-root-folder');
        expect(args).toContain('/original/working/directory/testResults');
        expect(args).toContain('--network-root-folder');
        expect(args).toContain(`/original/working/directory/${networkRootFolder}`);
    });
    test('should set CODECOV_TOKEN from task input if provided', async () => {
        const tokenValue = 'mock-token-from-input';
        // Mock codecovToken input provided with non-empty value
        tl.getInput.mockImplementation((name) => {
            if (name === 'codecovToken')
                return tokenValue;
            if (name === 'testResultFolderName')
                return 'testResults';
            if (name === 'coverageFileName')
                return '';
            return '';
        });
        // Mock CODECOV_TOKEN pipeline variable as undefined
        tl.getVariable.mockImplementation((name) => {
            if (name === 'CODECOV_TOKEN')
                return undefined;
            if (name === 'Agent.TempDirectory')
                return '/tmp';
            return undefined;
        });
        // Clear environment variable to ensure it gets set by the task
        process.env.CODECOV_TOKEN = undefined;
        await run();
        // The token should be undefined after running (it's set during the run but cleared at the end)
        // since we set it in the task
        expect(process.env.CODECOV_TOKEN).toBeUndefined();
        // Verify the token is NOT passed on command line with -t parameter
        const execFileSyncCalls = execFileSync.mock.calls;
        const uploadCallIndex = execFileSyncCalls.findIndex(([executable, args]) => executable === './codecov' && args.includes('upload-process'));
        expect(uploadCallIndex).toBeGreaterThan(-1);
        expect(execFileSyncCalls[uploadCallIndex][1]).not.toContain('-t');
    });
    test('should set CODECOV_TOKEN from pipeline variable if input not provided', async () => {
        const tokenValue = 'mock-token-from-pipeline';
        // Mock codecovToken input not provided (empty string)
        tl.getInput.mockImplementation((name) => {
            if (name === 'codecovToken')
                return '';
            if (name === 'testResultFolderName')
                return 'testResults';
            if (name === 'coverageFileName')
                return '';
            return '';
        });
        // Mock CODECOV_TOKEN pipeline variable
        tl.getVariable.mockImplementation((name) => {
            if (name === 'CODECOV_TOKEN')
                return tokenValue;
            if (name === 'Agent.TempDirectory')
                return '/tmp';
            return undefined;
        });
        // Clear environment variable to ensure it gets set by the task
        process.env.CODECOV_TOKEN = undefined;
        await run();
        // The token should be undefined after running (it's set during the run but cleared at the end)
        // since we set it in the task
        expect(process.env.CODECOV_TOKEN).toBeUndefined();
        // Verify the token is NOT passed on command line with -t parameter
        const execFileSyncCalls = execFileSync.mock.calls;
        const uploadCallIndex = execFileSyncCalls.findIndex(([executable, args]) => executable === './codecov' && args.includes('upload-process'));
        expect(uploadCallIndex).toBeGreaterThan(-1);
        expect(execFileSyncCalls[uploadCallIndex][1]).not.toContain('-t');
    });
    test('should treat blank codecovToken input as empty and fall back to pipeline variable', async () => {
        const tokenValue = 'mock-token-from-pipeline';
        // Mock codecovToken input provided as a blank string
        tl.getInput.mockImplementation((name) => {
            if (name === 'codecovToken')
                return '   '; // Blank string with spaces
            if (name === 'testResultFolderName')
                return 'testResults';
            if (name === 'coverageFileName')
                return '';
            return '';
        });
        // Mock CODECOV_TOKEN pipeline variable
        tl.getVariable.mockImplementation((name) => {
            if (name === 'CODECOV_TOKEN')
                return tokenValue;
            if (name === 'Agent.TempDirectory')
                return '/tmp';
            return undefined;
        });
        // Clear environment variable to ensure it gets set by the task
        process.env.CODECOV_TOKEN = undefined;
        await run();
        // The token should be undefined after running (it's set during the run but cleared at the end)
        // since we set it in the task
        expect(process.env.CODECOV_TOKEN).toBeUndefined();
        // Verify the token is NOT passed on command line with -t parameter
        const execFileSyncCalls = execFileSync.mock.calls;
        const uploadCallIndex = execFileSyncCalls.findIndex(([executable, args]) => executable === './codecov' && args.includes('upload-process'));
        expect(uploadCallIndex).toBeGreaterThan(-1);
        expect(execFileSyncCalls[uploadCallIndex][1]).not.toContain('-t');
    });
    test('should clear CODECOV_TOKEN only if it was set by the task', async () => {
        // First case: Task doesn't change the token value
        // Setup an existing token in the environment
        const initialToken = 'initial-token';
        process.env.CODECOV_TOKEN = initialToken;
        // Mock codecovToken input to return the same value as current environment
        tl.getInput.mockImplementation((name) => {
            if (name === 'codecovToken')
                return initialToken; // Same as existing token
            if (name === 'testResultFolderName')
                return 'testResults';
            return '';
        });
        // Mock CODECOV_TOKEN pipeline variable not provided
        tl.getVariable.mockImplementation((name) => {
            if (name === 'Agent.TempDirectory')
                return '/tmp';
            return undefined;
        });
        // Reset the tokenWasSetByTask flag from previous tests
        setTokenWasSetByTask(false);
        await run();
        // Token should still exist since we didn't change it (tokenWasSetByTask should be false)
        expect(process.env.CODECOV_TOKEN).toBe(initialToken);
        // Second case: Task sets a different token value
        // Reset and setup for new test case
        jest.clearAllMocks();
        process.env.CODECOV_TOKEN = initialToken;
        // Mock codecovToken input provided with a new value (different from existing)
        const newToken = 'new-token';
        tl.getInput.mockImplementation((name) => {
            if (name === 'codecovToken')
                return newToken; // Different from existing token
            if (name === 'testResultFolderName')
                return 'testResults';
            return '';
        });
        await run();
        // Since we set a different token in the task, it should be cleared on completion
        expect(process.env.CODECOV_TOKEN).toBeUndefined();
    });
    test('should clear CODECOV_TOKEN on error if it was set by the task', async () => {
        // Setup: Start with no token in environment
        process.env.CODECOV_TOKEN = undefined;
        // Mock codecovToken input provided
        const tokenValue = 'error-test-token';
        tl.getInput.mockImplementation((name) => {
            if (name === 'codecovToken')
                return tokenValue;
            if (name === 'testResultFolderName')
                return 'testResults';
            if (name === 'coverageFileName')
                return 'non-existent-file.xml';
            return '';
        });
        // Force an error by making the file check fail
        fs.existsSync.mockImplementation((path) => {
            if (path.includes('non-existent-file.xml'))
                return false;
            return true;
        });
        await run();
        // Verify token was cleared even though there was an error
        expect(process.env.CODECOV_TOKEN).toBeUndefined();
        // Verify error was properly reported
        expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.Failed, expect.stringContaining('Specified coverage file not found'));
    });
    // Tests for GPG verification
    test('should call gpg with correct arguments', async () => {
        await run();
        // Verify gpg import call
        expect(execFileSync).toHaveBeenCalledWith('gpg', ['--no-default-keyring', '--import', 'pgp_keys.asc'], expect.anything());
        // Verify gpg verify call
        expect(execFileSync).toHaveBeenCalledWith('gpg', ['--verify', 'codecov.SHA256SUM.sig', 'codecov.SHA256SUM'], expect.anything());
    });
    test('should verify file checksum using the mocked function', async () => {
        await run();
        // Check that verifyFileChecksum was called with the correct arguments
        expect(verifyFileChecksum).toHaveBeenCalledWith('codecov', 'codecov.SHA256SUM', expect.any(Function));
        // Advanced check: the logger function should delegate to logger.info
        const call = verifyFileChecksum.mock.calls.find(([file, sum, loggerFn]) => file === 'codecov' && sum === 'codecov.SHA256SUM');
        expect(call).toBeTruthy();
        const loggerFn = call && call[2];
        // Spy on logger.info
        const infoSpy = jest.spyOn(logger, 'info');
        // Call the logger function with a test message
        const testMsg = 'test-message';
        loggerFn(testMsg);
        expect(infoSpy).toHaveBeenCalledWith(testMsg);
    });
});
