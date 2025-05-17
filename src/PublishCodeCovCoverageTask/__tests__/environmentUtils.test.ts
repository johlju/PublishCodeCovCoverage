import { clearSensitiveEnvironmentVariables, setTokenWasSetByTask, getTokenWasSetByTask } from '../utils/environmentUtils';

describe('environmentUtils', () => {
  // Store original env to restore it after each test
  let originalEnv: NodeJS.ProcessEnv;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    // Store original environment
    originalEnv = { ...process.env };
    // Spy on console.log
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    // Reset the tokenWasSetByTask flag
    setTokenWasSetByTask(false);
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
    // Restore console.log
    consoleLogSpy.mockRestore();
  });

  describe('clearSensitiveEnvironmentVariables', () => {
    it('should remove CODECOV_TOKEN when tokenWasSetByTask is true', () => {
      // Arrange
      process.env.CODECOV_TOKEN = 'test-token';
      setTokenWasSetByTask(true);

      // Act
      clearSensitiveEnvironmentVariables();

      // Assert
      expect(process.env.CODECOV_TOKEN).toBeUndefined();
      expect(consoleLogSpy).toHaveBeenCalledWith('Removing CODECOV_TOKEN environment variable for security');
    });

    it('should not remove CODECOV_TOKEN when tokenWasSetByTask is false', () => {
      // Arrange
      process.env.CODECOV_TOKEN = 'test-token';
      setTokenWasSetByTask(false);

      // Act
      clearSensitiveEnvironmentVariables();

      // Assert
      expect(process.env.CODECOV_TOKEN).toBe('test-token');
      expect(consoleLogSpy).not.toHaveBeenCalledWith('Removing CODECOV_TOKEN environment variable for security');
    });

    it('should not attempt to remove CODECOV_TOKEN when it does not exist', () => {
      // Arrange
      delete process.env.CODECOV_TOKEN;
      setTokenWasSetByTask(true);

      // Act
      clearSensitiveEnvironmentVariables();

      // Assert
      expect(process.env.CODECOV_TOKEN).toBeUndefined();
      expect(consoleLogSpy).not.toHaveBeenCalledWith('Removing CODECOV_TOKEN environment variable for security');
    });
  });

  describe('setTokenWasSetByTask', () => {
    it('should set the tokenWasSetByTask flag', () => {
      // Act
      setTokenWasSetByTask(true);

      // Assert
      expect(getTokenWasSetByTask()).toBe(true);

      // Act again
      setTokenWasSetByTask(false);

      // Assert again
      expect(getTokenWasSetByTask()).toBe(false);
    });
  });
});
