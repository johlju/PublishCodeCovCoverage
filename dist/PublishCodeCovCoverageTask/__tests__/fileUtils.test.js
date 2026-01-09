import * as fs from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { verifyFileChecksum, calculateFileHashStreaming } from '../utils/fileUtils.js';
// Mock fs, fs.promises, path and crypto modules
jest.mock('node:fs', () => ({
    ...jest.requireActual('node:fs'),
    promises: {
        readFile: jest.fn(),
    },
    createReadStream: jest.fn(),
}));
jest.mock('node:path');
jest.mock('node:crypto');
describe('verifyFileChecksum', () => {
    // Store original console.log to restore later
    const originalConsoleLog = console.log;
    beforeEach(() => {
        // Mock console.log to prevent output during tests
        console.log = jest.fn();
        // Reset all mocks before each test
        jest.resetAllMocks();
    });
    afterEach(() => {
        // Restore original console.log after each test
        console.log = originalConsoleLog;
    });
    it('should verify checksum without errors for valid checksum', async () => {
        // Mock file path and checksum file path
        const filePath = '/path/to/file.txt';
        const checksumFilePath = '/path/to/checksums.txt';
        // Mock path.basename to return the filename
        path.basename.mockReturnValue('file.txt');
        // Mock fsPromises.readFile for the checksum file
        fsPromises.readFile.mockImplementation((path, encoding) => {
            if (path === checksumFilePath && encoding === 'utf8') {
                return Promise.resolve('abcdef1234567890 file.txt\nfedcba0987654321 other.txt');
            }
            else if (path === filePath) {
                return Promise.resolve(Buffer.from('file content'));
            }
            return Promise.resolve(null);
        });
        // Mock createReadStream
        const mockStreamOn = jest.fn((event, handler) => {
            if (event === 'data') {
                // Simulate a data event with the file content
                handler(Buffer.from('file content'));
            }
            if (event === 'end') {
                // Simulate the end event
                setTimeout(() => handler(), 0);
            }
            return mockReadStream;
        });
        const mockReadStream = { on: mockStreamOn };
        fs.createReadStream.mockReturnValue(mockReadStream);
        // Mock crypto hash functions
        const mockHashUpdate = jest.fn();
        const mockHashDigest = jest.fn().mockReturnValue('abcdef1234567890');
        const mockHashOn = jest.fn();
        mockHashUpdate.mockReturnValue({ digest: mockHashDigest, on: mockHashOn });
        mockHashOn.mockReturnValue({ update: mockHashUpdate, digest: mockHashDigest });
        const mockHash = {
            update: mockHashUpdate,
            digest: mockHashDigest,
            on: mockHashOn,
        };
        crypto.createHash.mockReturnValue(mockHash); // Execute function and verify it doesn't throw
        await expect(verifyFileChecksum(filePath, checksumFilePath)).resolves.not.toThrow();
        expect(fsPromises.readFile).toHaveBeenCalledWith(checksumFilePath, 'utf8');
        expect(fs.createReadStream).toHaveBeenCalledWith(filePath);
        expect(crypto.createHash).toHaveBeenCalledWith('sha256');
        expect(mockHashUpdate).toHaveBeenCalledWith(Buffer.from('file content'));
        expect(mockHashDigest).toHaveBeenCalledWith('hex');
    });
    it('should throw error when checksum file does not contain the filename', async () => {
        // Mock file path and checksum file path
        const filePath = '/path/to/file.txt';
        const checksumFilePath = '/path/to/checksums.txt';
        // Mock path.basename to return the filename
        path.basename.mockReturnValue('file.txt');
        // Mock fsPromises.readFile for the checksum file without the target file
        fsPromises.readFile.mockImplementation((path, encoding) => {
            if (path === checksumFilePath && encoding === 'utf8') {
                return Promise.resolve('fedcba0987654321 other.txt');
            }
            return Promise.resolve(Buffer.from('file content'));
        });
        // Execute function and expect error
        await expect(verifyFileChecksum(filePath, checksumFilePath)).rejects.toThrow(`Checksum not found for file.txt in ${checksumFilePath}`);
    });
    it('should throw error when calculated hash does not match expected hash', async () => {
        // Mock file path and checksum file path
        const filePath = '/path/to/file.txt';
        const checksumFilePath = '/path/to/checksums.txt';
        // Mock path.basename to return the filename
        path.basename.mockReturnValue('file.txt');
        // Mock fsPromises.readFile for the checksum file
        fsPromises.readFile.mockImplementation((path, encoding) => {
            if (path === checksumFilePath && encoding === 'utf8') {
                return Promise.resolve('expected1234567890 file.txt');
            }
            return Promise.resolve(Buffer.from('file content'));
        });
        // Mock createReadStream
        const mockStreamOn = jest.fn((event, handler) => {
            if (event === 'data') {
                // Simulate a data event with the file content
                handler(Buffer.from('file content'));
            }
            if (event === 'end') {
                // Simulate the end event
                setTimeout(() => handler(), 0);
            }
            return mockReadStream;
        });
        const mockReadStream = { on: mockStreamOn };
        fs.createReadStream.mockReturnValue(mockReadStream);
        // Mock crypto hash functions to return a different hash than expected
        const mockHashUpdate = jest.fn();
        const mockHashDigest = jest.fn().mockReturnValue('actual0987654321');
        const mockHashOn = jest.fn();
        mockHashUpdate.mockReturnValue({ digest: mockHashDigest, on: mockHashOn });
        mockHashOn.mockReturnValue({ update: mockHashUpdate, digest: mockHashDigest });
        const mockHash = {
            update: mockHashUpdate,
            digest: mockHashDigest,
            on: mockHashOn,
        };
        crypto.createHash.mockReturnValue(mockHash);
        // Execute function and expect error
        await expect(verifyFileChecksum(filePath, checksumFilePath)).rejects.toThrow(`SHA-256 checksum verification failed for ${filePath}:\nExpected: expected1234567890\nActual: actual0987654321`);
    });
    it('should not match partial filenames', async () => {
        // Mock file path and checksum file path
        const filePath = '/path/to/file.txt';
        const checksumFilePath = '/path/to/checksums.txt';
        // Mock path.basename to return the filename
        path.basename.mockReturnValue('file.txt');
        // Mock fsPromises.readFile for the checksum file with a similar but not exact filename
        fsPromises.readFile.mockImplementation((path, encoding) => {
            if (path === checksumFilePath && encoding === 'utf8') {
                return Promise.resolve('abcdef1234567890 profile.txt\nfedcba0987654321 myfile.txt');
            }
            return Promise.resolve(Buffer.from('file content'));
        });
        // Execute function and expect error because no exact match for 'file.txt'
        await expect(verifyFileChecksum(filePath, checksumFilePath)).rejects.toThrow(`Checksum not found for file.txt in ${checksumFilePath}`);
    });
    it('should throw error when checksum file cannot be read', async () => {
        // Mock file path and checksum file path
        const filePath = '/path/to/file.txt';
        const checksumFilePath = '/path/to/checksums.txt';
        // Mock fsPromises.readFile to reject with an error for the checksum file
        fsPromises.readFile.mockImplementation((path, encoding) => {
            if (path === checksumFilePath && encoding === 'utf8') {
                return Promise.reject(new Error('ENOENT: File not found'));
            }
            return Promise.resolve(Buffer.from('file content'));
        });
        // Execute function and expect proper error
        await expect(verifyFileChecksum(filePath, checksumFilePath)).rejects.toThrow(`Failed to read checksum file ${checksumFilePath}: ENOENT: File not found`);
    });
    it('should throw error when target file cannot be read', async () => {
        // Mock file path and checksum file path
        const filePath = '/path/to/file.txt';
        const checksumFilePath = '/path/to/checksums.txt';
        // Mock path.basename to return the filename
        path.basename.mockReturnValue('file.txt');
        // Mock fsPromises.readFile for the checksum file
        fsPromises.readFile.mockImplementation((path, encoding) => {
            if (path === checksumFilePath && encoding === 'utf8') {
                return Promise.resolve('abcdef1234567890 file.txt\nfedcba0987654321 other.txt');
            }
            return Promise.resolve(Buffer.from('file content'));
        });
        // Mock createReadStream to throw an error immediately
        fs.createReadStream.mockImplementation(() => {
            throw new Error('ENOENT: File not found');
        });
        // Execute function and expect proper error
        await expect(verifyFileChecksum(filePath, checksumFilePath)).rejects.toThrow(`Failed to verify checksum for ${filePath}: Failed to read file ${filePath}: ENOENT: File not found`);
    });
    it('should throw error when hash calculation fails', async () => {
        // Mock file path and checksum file path
        const filePath = '/path/to/file.txt';
        const checksumFilePath = '/path/to/checksums.txt';
        // Mock path.basename to return the filename
        path.basename.mockReturnValue('file.txt');
        // Mock fsPromises.readFile for the checksum file
        fsPromises.readFile.mockImplementation((path, encoding) => {
            if (path === checksumFilePath && encoding === 'utf8') {
                return Promise.resolve('abcdef1234567890 file.txt\nfedcba0987654321 other.txt');
            }
            return Promise.resolve(Buffer.from('file content'));
        });
        // Mock the file stream that will work normally
        const mockStreamOn = jest.fn((event, handler) => {
            if (event === 'data') {
                // Simulate a data event with the file content
                handler(Buffer.from('file content'));
            }
            if (event === 'end') {
                // Simulate the end event
                setTimeout(() => handler(), 0);
            }
            return mockReadStream;
        });
        const mockReadStream = { on: mockStreamOn };
        fs.createReadStream.mockReturnValue(mockReadStream);
        // Mock crypto hash functions to throw an error during update
        const mockHashUpdate = jest.fn().mockImplementation(() => {
            throw new Error('Hash calculation failed');
        });
        const mockHashDigest = jest.fn();
        const mockHashOn = jest.fn().mockImplementation((event, handler) => {
            if (event === 'error') {
                // Trigger the error handler
                setTimeout(() => handler(new Error('Hash calculation failed')), 0);
            }
            return mockHash;
        });
        const mockHash = {
            update: mockHashUpdate,
            digest: mockHashDigest,
            on: mockHashOn,
        };
        crypto.createHash.mockReturnValue(mockHash);
        // Execute function and expect error
        await expect(verifyFileChecksum(filePath, checksumFilePath)).rejects.toThrow(`Failed to verify checksum for ${filePath}: Failed to read file ${filePath}: Hash calculation failed`);
    });
    it('should use the provided logger function', async () => {
        // Mock file path and checksum file path
        const filePath = '/path/to/file.txt';
        const checksumFilePath = '/path/to/checksums.txt';
        // Mock path.basename to return the filename
        path.basename.mockReturnValue('file.txt'); // Mock fsPromises.readFile for the checksum file
        fsPromises.readFile.mockImplementation((path, encoding) => {
            if (path === checksumFilePath && encoding === 'utf8') {
                return Promise.resolve('abcdef1234567890 file.txt');
            }
            return Promise.resolve(Buffer.from('file content'));
        });
        // Mock createReadStream
        const mockStreamOn = jest.fn((event, handler) => {
            if (event === 'data') {
                // Simulate a data event with the file content
                handler(Buffer.from('file content'));
            }
            if (event === 'end') {
                // Simulate the end event
                setTimeout(() => handler(), 0);
            }
            return mockReadStream;
        });
        const mockReadStream = { on: mockStreamOn };
        fs.createReadStream.mockReturnValue(mockReadStream);
        // Mock crypto hash functions
        const mockHashUpdate = jest.fn();
        const mockHashDigest = jest.fn().mockReturnValue('abcdef1234567890');
        const mockHashOn = jest.fn();
        mockHashUpdate.mockReturnValue({ digest: mockHashDigest, on: mockHashOn });
        mockHashOn.mockReturnValue({ update: mockHashUpdate, digest: mockHashDigest });
        const mockHash = {
            update: mockHashUpdate,
            digest: mockHashDigest,
            on: mockHashOn,
        };
        crypto.createHash.mockReturnValue(mockHash);
        // Create a mock logger function
        const mockLogger = jest.fn();
        // Execute function with the mock logger
        await verifyFileChecksum(filePath, checksumFilePath, mockLogger);
        // Verify that the logger was called with the expected messages
        expect(mockLogger).toHaveBeenCalledTimes(2);
        expect(mockLogger).toHaveBeenNthCalledWith(1, `Verifying SHA-256 checksum for ${filePath} using Node.js crypto module`);
        expect(mockLogger).toHaveBeenNthCalledWith(2, `SHA-256 checksum verified for ${filePath}`);
    });
    // Edge case: Empty checksum file
    it('should throw error when checksum file is empty', async () => {
        // Mock file path and checksum file path
        const filePath = '/path/to/file.txt';
        const checksumFilePath = '/path/to/checksums.txt';
        // Mock path.basename to return the filename
        path.basename.mockReturnValue('file.txt'); // Mock fsPromises.readFile for an empty checksum file
        fsPromises.readFile.mockImplementation((path, encoding) => {
            if (path === checksumFilePath && encoding === 'utf8') {
                return Promise.resolve(''); // Empty file
            }
            return Promise.resolve(Buffer.from('file content'));
        });
        // Execute function and expect error about missing checksum
        await expect(verifyFileChecksum(filePath, checksumFilePath)).rejects.toThrow(`Checksum not found for file.txt in ${checksumFilePath}`);
    });
    // Edge case: Malformed checksum line (no whitespace separator)
    it('should handle malformed checksum line without proper format', async () => {
        // Mock file path and checksum file path
        const filePath = '/path/to/file.txt';
        const checksumFilePath = '/path/to/checksums.txt';
        // Mock path.basename to return the filename
        path.basename.mockReturnValue('file.txt'); // Mock fsPromises.readFile for a malformed checksum file
        fsPromises.readFile.mockImplementation((path, encoding) => {
            if (path === checksumFilePath && encoding === 'utf8') {
                return Promise.resolve('abcdef1234567890file.txt\nvalidhash otherfile.txt'); // No space between hash and filename
            }
            return Promise.resolve(Buffer.from('file content'));
        });
        // Execute function and expect error about missing checksum
        await expect(verifyFileChecksum(filePath, checksumFilePath)).rejects.toThrow(`Checksum not found for file.txt in ${checksumFilePath}`);
    });
    // Edge case: Checksum file with comments or special formatting lines
    it('should ignore comment lines in checksum file', async () => {
        // Mock file path and checksum file path
        const filePath = '/path/to/file.txt';
        const checksumFilePath = '/path/to/checksums.txt';
        // Mock path.basename to return the filename
        path.basename.mockReturnValue('file.txt'); // Mock fsPromises.readFile for checksum file with comments
        fsPromises.readFile.mockImplementation((path, encoding) => {
            if (path === checksumFilePath && encoding === 'utf8') {
                return Promise.resolve('# SHA-256 checksums\n' +
                    '# Generated on 2023-08-15\n' +
                    'abcdef1234567890 file.txt\n' +
                    '# End of file');
            }
            return Promise.resolve(Buffer.from('file content'));
        });
        // Mock createReadStream
        const mockStreamOn = jest.fn((event, handler) => {
            if (event === 'data') {
                handler(Buffer.from('file content'));
            }
            if (event === 'end') {
                setTimeout(() => handler(), 0);
            }
            return mockReadStream;
        });
        const mockReadStream = { on: mockStreamOn };
        fs.createReadStream.mockReturnValue(mockReadStream);
        // Mock crypto hash functions
        const mockHashUpdate = jest.fn();
        const mockHashDigest = jest.fn().mockReturnValue('abcdef1234567890');
        const mockHashOn = jest.fn();
        mockHashUpdate.mockReturnValue({ digest: mockHashDigest, on: mockHashOn });
        mockHashOn.mockReturnValue({ update: mockHashUpdate, digest: mockHashDigest });
        const mockHash = {
            update: mockHashUpdate,
            digest: mockHashDigest,
            on: mockHashOn,
        };
        crypto.createHash.mockReturnValue(mockHash);
        // Execute function - should succeed ignoring comment lines
        await expect(verifyFileChecksum(filePath, checksumFilePath)).resolves.not.toThrow();
    });
    // Edge case: File with Unicode filename
    it('should handle files with Unicode filenames', async () => {
        // Mock file path with Unicode characters
        const filePath = '/path/to/文件.txt';
        const checksumFilePath = '/path/to/checksums.txt';
        // Mock path.basename to return the Unicode filename
        path.basename.mockReturnValue('文件.txt'); // Mock fsPromises.readFile for the checksum file with Unicode filename
        fsPromises.readFile.mockImplementation((path, encoding) => {
            if (path === checksumFilePath && encoding === 'utf8') {
                return Promise.resolve('abcdef1234567890 文件.txt');
            }
            return Promise.resolve(Buffer.from('file content'));
        });
        // Mock createReadStream
        const mockStreamOn = jest.fn((event, handler) => {
            if (event === 'data') {
                handler(Buffer.from('file content'));
            }
            if (event === 'end') {
                setTimeout(() => handler(), 0);
            }
            return mockReadStream;
        });
        const mockReadStream = { on: mockStreamOn };
        fs.createReadStream.mockReturnValue(mockReadStream);
        // Mock crypto hash functions
        const mockHashUpdate = jest.fn();
        const mockHashDigest = jest.fn().mockReturnValue('abcdef1234567890');
        const mockHashOn = jest.fn();
        mockHashUpdate.mockReturnValue({ digest: mockHashDigest, on: mockHashOn });
        mockHashOn.mockReturnValue({ update: mockHashUpdate, digest: mockHashDigest });
        const mockHash = {
            update: mockHashUpdate,
            digest: mockHashDigest,
            on: mockHashOn,
        };
        crypto.createHash.mockReturnValue(mockHash);
        // Execute function - should succeed with Unicode filename
        await expect(verifyFileChecksum(filePath, checksumFilePath)).resolves.not.toThrow();
    });
    // Edge case: Multiple spaces in checksum file
    it('should handle checksum file with multiple spaces or tabs between hash and filename', async () => {
        // Mock file path and checksum file path
        const filePath = '/path/to/file.txt';
        const checksumFilePath = '/path/to/checksums.txt';
        // Mock path.basename to return the filename
        path.basename.mockReturnValue('file.txt'); // Mock fsPromises.readFile for checksum file with irregular spacing
        fsPromises.readFile.mockImplementation((path, encoding) => {
            if (path === checksumFilePath && encoding === 'utf8') {
                return Promise.resolve('abcdef1234567890    file.txt\n' + // Multiple spaces
                    'fedcba0987654321\tother.txt'); // Tab character
            }
            return Promise.resolve(Buffer.from('file content'));
        });
        // Mock createReadStream
        const mockStreamOn = jest.fn((event, handler) => {
            if (event === 'data') {
                handler(Buffer.from('file content'));
            }
            if (event === 'end') {
                setTimeout(() => handler(), 0);
            }
            return mockReadStream;
        });
        const mockReadStream = { on: mockStreamOn };
        fs.createReadStream.mockReturnValue(mockReadStream);
        // Mock crypto hash functions
        const mockHashUpdate = jest.fn();
        const mockHashDigest = jest.fn().mockReturnValue('abcdef1234567890');
        const mockHashOn = jest.fn();
        mockHashUpdate.mockReturnValue({ digest: mockHashDigest, on: mockHashOn });
        mockHashOn.mockReturnValue({ update: mockHashUpdate, digest: mockHashDigest });
        const mockHash = {
            update: mockHashUpdate,
            digest: mockHashDigest,
            on: mockHashOn,
        };
        crypto.createHash.mockReturnValue(mockHash);
        // Execute function - should succeed with irregular spacing
        await expect(verifyFileChecksum(filePath, checksumFilePath)).resolves.not.toThrow();
    });
});
describe('calculateFileHashStreaming', () => {
    // Store original console.log to restore later
    const originalConsoleLog = console.log;
    beforeEach(() => {
        // Reset all mocks before each test
        jest.resetAllMocks();
    });
    afterEach(() => {
        // Restore original console.log after each test
        console.log = originalConsoleLog;
    });
    it('should calculate file hash correctly', async () => {
        // Mock file path
        const filePath = '/path/to/file.txt';
        // Mock createReadStream
        const mockStreamOn = jest.fn((event, handler) => {
            if (event === 'data') {
                // Simulate data events with file content in chunks
                handler(Buffer.from('chunk1'));
                handler(Buffer.from('chunk2'));
            }
            if (event === 'end') {
                // Simulate the end event
                setTimeout(() => handler(), 0);
            }
            return mockReadStream;
        });
        const mockReadStream = { on: mockStreamOn };
        fs.createReadStream.mockReturnValue(mockReadStream);
        // Mock crypto hash functions
        const mockHashUpdate = jest.fn();
        const mockHashDigest = jest.fn().mockReturnValue('abcdef1234567890');
        const mockHashOn = jest.fn();
        const mockHash = {
            update: mockHashUpdate,
            digest: mockHashDigest,
            on: mockHashOn,
        };
        crypto.createHash.mockReturnValue(mockHash);
        // Execute the function
        const hash = await calculateFileHashStreaming(filePath);
        // Verify expectations
        expect(fs.createReadStream).toHaveBeenCalledWith(filePath);
        expect(crypto.createHash).toHaveBeenCalledWith('sha256');
        expect(mockHashUpdate).toHaveBeenCalledWith(Buffer.from('chunk1'));
        expect(mockHashUpdate).toHaveBeenCalledWith(Buffer.from('chunk2'));
        expect(mockHashDigest).toHaveBeenCalledWith('hex');
        expect(hash).toBe('abcdef1234567890');
    });
    it('should handle file read errors', async () => {
        // Mock file path
        const filePath = '/path/to/nonexistent.txt';
        // Mock createReadStream with error event
        const mockStreamOn = jest.fn((event, handler) => {
            if (event === 'error') {
                // Simulate an error event
                setTimeout(() => handler(new Error('ENOENT: File not found')), 0);
            }
            return mockReadStream;
        });
        const mockReadStream = { on: mockStreamOn };
        fs.createReadStream.mockReturnValue(mockReadStream);
        // Mock crypto hash functions
        const mockHashUpdate = jest.fn();
        const mockHashDigest = jest.fn();
        const mockHashOn = jest.fn();
        const mockHash = {
            update: mockHashUpdate,
            digest: mockHashDigest,
            on: mockHashOn,
        };
        crypto.createHash.mockReturnValue(mockHash);
        // Execute the function and expect it to reject with error
        await expect(calculateFileHashStreaming(filePath)).rejects.toThrow(`Failed to read file ${filePath}: ENOENT: File not found`);
    });
    it('should handle hash calculation errors', async () => {
        // Mock file path
        const filePath = '/path/to/file.txt';
        // Mock createReadStream
        const mockStreamOn = jest.fn((event, handler) => {
            if (event === 'data') {
                // Simulate a data event with the file content
                handler(Buffer.from('file content'));
            }
            return mockReadStream;
        });
        const mockReadStream = { on: mockStreamOn };
        fs.createReadStream.mockReturnValue(mockReadStream);
        // Mock crypto hash functions with hash error
        const mockHashUpdate = jest.fn().mockImplementation(() => {
            throw new Error('Hash calculation failed');
        });
        const mockHashDigest = jest.fn();
        const mockHashOn = jest.fn().mockImplementation((event, handler) => {
            if (event === 'error') {
                // Simulate a hash error event
                setTimeout(() => handler(new Error('Hash calculation failed')), 0);
            }
            return mockHash;
        });
        const mockHash = {
            update: mockHashUpdate,
            digest: mockHashDigest,
            on: mockHashOn,
        };
        crypto.createHash.mockReturnValue(mockHash);
        // Execute function and expect it to reject with error
        await expect(calculateFileHashStreaming(filePath)).rejects.toThrow(`Failed to read file ${filePath}: Hash calculation failed`);
    });
});
