/// <reference path="../../../types/azure-pipelines-task-lib/task.d.ts" />
import { createRequire as _createRequire } from "module";
const __require = _createRequire(import.meta.url);
const tl = __require("azure-pipelines-task-lib/task");
import { handleUnhandledError } from '../utils/errorUtils.js';
import * as environmentUtils from '../utils/environmentUtils.js';
import logger from '../utils/logger.js';
jest.mock('azure-pipelines-task-lib/task');
jest.mock('../utils/environmentUtils');
describe('errorUtils', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(logger, 'error').mockImplementation(() => logger);
    });
    describe('handleUnhandledError', () => {
        test('should log error, clear sensitive variables, and set task result as failed', () => {
            // Arrange
            const testError = new Error('Test unhandled error');
            const loggerErrorSpy = jest.spyOn(logger, 'error');
            const clearSensitiveEnvSpy = jest.spyOn(environmentUtils, 'clearSensitiveEnvironmentVariables');
            // Act
            handleUnhandledError(testError);
            // Assert
            expect(loggerErrorSpy).toHaveBeenCalledWith('Unhandled error:', testError);
            expect(clearSensitiveEnvSpy).toHaveBeenCalled();
            expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.Failed, 'Unhandled error: Test unhandled error');
        });
    });
});
