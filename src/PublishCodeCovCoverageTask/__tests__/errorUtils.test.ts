import * as tl from 'azure-pipelines-task-lib/task';
import { handleUnhandledError } from '../utils/errorUtils';
import * as environmentUtils from '../utils/environmentUtils';

jest.mock('azure-pipelines-task-lib/task');
jest.mock('../utils/environmentUtils');

describe('errorUtils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock console.error to keep test output clean
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('handleUnhandledError', () => {
    test('should log error, clear sensitive variables, and set task result as failed', () => {
      // Arrange
      const testError = new Error('Test unhandled error');
      const consoleSpy = jest.spyOn(console, 'error');
      const clearSensitiveEnvSpy = jest.spyOn(
        environmentUtils,
        'clearSensitiveEnvironmentVariables'
      );

      // Act
      handleUnhandledError(testError);

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith('Unhandled error:', testError);
      expect(clearSensitiveEnvSpy).toHaveBeenCalled();
      expect(tl.setResult).toHaveBeenCalledWith(
        tl.TaskResult.Failed,
        'Unhandled error: Test unhandled error'
      );
    });
  });
});
