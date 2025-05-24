import * as tl from 'azure-pipelines-task-lib/task';
import { handleUnhandledError } from '../utils/errorUtils';
import * as environmentUtils from '../utils/environmentUtils';
import logger from '../utils/logger';

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
      const clearSensitiveEnvSpy = jest.spyOn(
        environmentUtils,
        'clearSensitiveEnvironmentVariables'
      );

      // Act
      handleUnhandledError(testError);

      // Assert
      expect(loggerErrorSpy).toHaveBeenCalledWith('Unhandled error:', testError);
      expect(clearSensitiveEnvSpy).toHaveBeenCalled();
      expect(tl.setResult).toHaveBeenCalledWith(
        tl.TaskResult.Failed,
        'Unhandled error: Test unhandled error'
      );
    });
  });
});
