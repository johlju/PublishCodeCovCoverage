import { quoteCommandArgument } from '../utils/commandUtils';

describe('commandUtils', () => {
  describe('quoteCommandArgument', () => {
    test('should wrap a simple string in quotes', () => {
      const result = quoteCommandArgument('hello');
      expect(result).toBe('"hello"');
    });

    test('should escape double quotes', () => {
      const result = quoteCommandArgument('hello "world"');
      expect(result).toBe('"hello \\"world\\""');
    });

    test('should escape backslashes', () => {
      const result = quoteCommandArgument('C:\\Program Files\\App');
      expect(result).toBe('"C:\\\\Program Files\\\\App"');
    });

    test('should handle strings with both quotes and backslashes', () => {
      const result = quoteCommandArgument('path with "quotes" and \\backslashes\\');
      expect(result).toBe('"path with \\"quotes\\" and \\\\backslashes\\\\"');
    });

    test('should handle empty strings', () => {
      const result = quoteCommandArgument('');
      expect(result).toBe('""');
    });

    test('should handle strings with special characters', () => {
      const result = quoteCommandArgument('file with spaces and $pecial ch@rs');
      expect(result).toBe('"file with spaces and $pecial ch@rs"');
    });

    test('should handle strings with single quotes', () => {
      const result = quoteCommandArgument("argument with 'single quotes'");
      expect(result).toBe('"argument with \'single quotes\'"');
    });

    test('should handle paths with multiple backslashes', () => {
      const result = quoteCommandArgument('C:\\Users\\username\\Documents\\');
      expect(result).toBe('"C:\\\\Users\\\\username\\\\Documents\\\\"');
    });

    test('should correctly handle complex string with quotes, backslashes, and special characters', () => {
      const complexString = 'C:\\Program Files\\App "Name"\\config$file-v1.2@~!.txt';
      const result = quoteCommandArgument(complexString);
      expect(result).toBe('"C:\\\\Program Files\\\\App \\"Name\\"\\\\config$file-v1.2@~!.txt"');
    });
  });
});
