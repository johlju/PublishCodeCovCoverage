import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { verifyFileChecksum, calculateFileHashStreaming } from '../utils/fileUtils';

// Mock fs and crypto modules
jest.mock('node:fs');
jest.mock('node:path');
jest.mock('node:crypto');

// Define interface for mocked stream
interface MockedStream {
    on: jest.Mock;
}

// Define interface for mocked hash
interface MockedHash {
    update: jest.Mock;
    digest: jest.Mock;
    on: jest.Mock;
}

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
        (path.basename as jest.Mock).mockReturnValue('file.txt');

        // Mock fs.readFileSync for the checksum file
        (fs.readFileSync as jest.Mock).mockImplementation((path: string, encoding?: string) => {
            if (path === checksumFilePath && encoding === 'utf8') {
                return 'abcdef1234567890 file.txt\nfedcba0987654321 other.txt';
            } else if (path === filePath) {
                return Buffer.from('file content');
            }
            return null;
        });

        // Mock createReadStream
        const mockStreamOn = jest.fn((event: string, handler: any) => {
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

        const mockReadStream: MockedStream = { on: mockStreamOn };
        (fs.createReadStream as jest.Mock).mockReturnValue(mockReadStream);

        // Mock crypto hash functions
        const mockHashUpdate = jest.fn();
        const mockHashDigest = jest.fn().mockReturnValue('abcdef1234567890');
        const mockHashOn = jest.fn();

        mockHashUpdate.mockReturnValue({ digest: mockHashDigest, on: mockHashOn });
        mockHashOn.mockReturnValue({ update: mockHashUpdate, digest: mockHashDigest });

        const mockHash: MockedHash = {
            update: mockHashUpdate,
            digest: mockHashDigest,
            on: mockHashOn
        };

        (crypto.createHash as jest.Mock).mockReturnValue(mockHash);

        // Execute function and verify it doesn't throw
        await expect(verifyFileChecksum(filePath, checksumFilePath)).resolves.not.toThrow();
        expect(fs.readFileSync).toHaveBeenCalledWith(checksumFilePath, 'utf8');
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
        (path.basename as jest.Mock).mockReturnValue('file.txt');

        // Mock fs.readFileSync for the checksum file without the target file
        (fs.readFileSync as jest.Mock).mockImplementation((path: string, encoding?: string) => {
            if (path === checksumFilePath && encoding === 'utf8') {
                return 'fedcba0987654321 other.txt';
            }
            return Buffer.from('file content');
        });

        // Execute function and expect error
        await expect(verifyFileChecksum(filePath, checksumFilePath))
            .rejects.toThrow(`Checksum not found for file.txt in ${checksumFilePath}`);
    });

    it('should throw error when calculated hash does not match expected hash', async () => {
        // Mock file path and checksum file path
        const filePath = '/path/to/file.txt';
        const checksumFilePath = '/path/to/checksums.txt';

        // Mock path.basename to return the filename
        (path.basename as jest.Mock).mockReturnValue('file.txt');

        // Mock fs.readFileSync for the checksum file
        (fs.readFileSync as jest.Mock).mockImplementation((path: string, encoding?: string) => {
            if (path === checksumFilePath && encoding === 'utf8') {
                return 'expected1234567890 file.txt';
            }
            return Buffer.from('file content');
        });

        // Mock createReadStream
        const mockStreamOn = jest.fn((event: string, handler: any) => {
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

        const mockReadStream: MockedStream = { on: mockStreamOn };
        (fs.createReadStream as jest.Mock).mockReturnValue(mockReadStream);

        // Mock crypto hash functions to return a different hash than expected
        const mockHashUpdate = jest.fn();
        const mockHashDigest = jest.fn().mockReturnValue('actual0987654321');
        const mockHashOn = jest.fn();

        mockHashUpdate.mockReturnValue({ digest: mockHashDigest, on: mockHashOn });
        mockHashOn.mockReturnValue({ update: mockHashUpdate, digest: mockHashDigest });

        const mockHash: MockedHash = {
            update: mockHashUpdate,
            digest: mockHashDigest,
            on: mockHashOn
        };

        (crypto.createHash as jest.Mock).mockReturnValue(mockHash);

        // Execute function and expect error
        await expect(verifyFileChecksum(filePath, checksumFilePath))
            .rejects.toThrow(`SHA-256 checksum verification failed for ${filePath}:\nExpected: expected1234567890\nActual: actual0987654321`);
    });

    it('should not match partial filenames', async () => {
        // Mock file path and checksum file path
        const filePath = '/path/to/file.txt';
        const checksumFilePath = '/path/to/checksums.txt';

        // Mock path.basename to return the filename
        (path.basename as jest.Mock).mockReturnValue('file.txt');

        // Mock fs.readFileSync for the checksum file with a similar but not exact filename
        (fs.readFileSync as jest.Mock).mockImplementation((path: string, encoding?: string) => {
            if (path === checksumFilePath && encoding === 'utf8') {
                return 'abcdef1234567890 profile.txt\nfedcba0987654321 myfile.txt';
            }
            return Buffer.from('file content');
        });

        // Execute function and expect error because no exact match for 'file.txt'
        await expect(verifyFileChecksum(filePath, checksumFilePath))
            .rejects.toThrow(`Checksum not found for file.txt in ${checksumFilePath}`);
    });

    it('should throw error when checksum file cannot be read', async () => {
        // Mock file path and checksum file path
        const filePath = '/path/to/file.txt';
        const checksumFilePath = '/path/to/checksums.txt';

        // Mock fs.readFileSync to throw an error for the checksum file
        (fs.readFileSync as jest.Mock).mockImplementation((path: string, encoding?: string) => {
            if (path === checksumFilePath && encoding === 'utf8') {
                throw new Error('ENOENT: File not found');
            }
            return Buffer.from('file content');
        });

        // Execute function and expect proper error
        await expect(verifyFileChecksum(filePath, checksumFilePath))
            .rejects.toThrow(`Failed to read checksum file ${checksumFilePath}: ENOENT: File not found`);
    });

    it('should throw error when target file cannot be read', async () => {
        // Mock file path and checksum file path
        const filePath = '/path/to/file.txt';
        const checksumFilePath = '/path/to/checksums.txt';

        // Mock path.basename to return the filename
        (path.basename as jest.Mock).mockReturnValue('file.txt');

        // Mock fs.readFileSync for the checksum file
        (fs.readFileSync as jest.Mock).mockImplementation((path: string, encoding?: string) => {
            if (path === checksumFilePath && encoding === 'utf8') {
                return 'abcdef1234567890 file.txt\nfedcba0987654321 other.txt';
            }
            return Buffer.from('file content');
        });

        // Mock createReadStream to throw an error immediately
        (fs.createReadStream as jest.Mock).mockImplementation(() => {
            throw new Error('ENOENT: File not found');
        });

        // Execute function and expect proper error
        await expect(verifyFileChecksum(filePath, checksumFilePath))
            .rejects.toThrow(`Failed to verify checksum for ${filePath}: Failed to read file ${filePath}: ENOENT: File not found`);
    });

    it('should throw error when hash calculation fails', async () => {
        // Mock file path and checksum file path
        const filePath = '/path/to/file.txt';
        const checksumFilePath = '/path/to/checksums.txt';

        // Mock path.basename to return the filename
        (path.basename as jest.Mock).mockReturnValue('file.txt');

        // Mock fs.readFileSync for the checksum file
        (fs.readFileSync as jest.Mock).mockImplementation((path: string, encoding?: string) => {
            if (path === checksumFilePath && encoding === 'utf8') {
                return 'abcdef1234567890 file.txt\nfedcba0987654321 other.txt';
            }
            return Buffer.from('file content');
        });

        // Mock the file stream that will work normally
        const mockStreamOn = jest.fn((event: string, handler: any) => {
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

        const mockReadStream: MockedStream = { on: mockStreamOn };
        (fs.createReadStream as jest.Mock).mockReturnValue(mockReadStream);

        // Mock crypto hash functions to throw an error during update
        const mockHashUpdate = jest.fn().mockImplementation(() => {
            throw new Error('Hash calculation failed');
        });
        const mockHashDigest = jest.fn();
        const mockHashOn = jest.fn().mockImplementation((event: string, handler: any) => {
            if (event === 'error') {
                // Trigger the error handler
                setTimeout(() => handler(new Error('Hash calculation failed')), 0);
            }
            return mockHash;
        });

        const mockHash: MockedHash = {
            update: mockHashUpdate,
            digest: mockHashDigest,
            on: mockHashOn
        };

        (crypto.createHash as jest.Mock).mockReturnValue(mockHash);

        // Execute function and expect error
        await expect(verifyFileChecksum(filePath, checksumFilePath))
            .rejects.toThrow(`Failed to verify checksum for ${filePath}: Failed to read file ${filePath}: Hash calculation failed`);
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
        const mockStreamOn = jest.fn((event: string, handler: any) => {
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

        const mockReadStream: MockedStream = { on: mockStreamOn };
        (fs.createReadStream as jest.Mock).mockReturnValue(mockReadStream);

        // Mock crypto hash functions
        const mockHashUpdate = jest.fn();
        const mockHashDigest = jest.fn().mockReturnValue('abcdef1234567890');
        const mockHashOn = jest.fn();

        const mockHash: MockedHash = {
            update: mockHashUpdate,
            digest: mockHashDigest,
            on: mockHashOn
        };

        (crypto.createHash as jest.Mock).mockReturnValue(mockHash);

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
        const mockStreamOn = jest.fn((event: string, handler: any) => {
            if (event === 'error') {
                // Simulate an error event
                setTimeout(() => handler(new Error('ENOENT: File not found')), 0);
            }
            return mockReadStream;
        });

        const mockReadStream: MockedStream = { on: mockStreamOn };
        (fs.createReadStream as jest.Mock).mockReturnValue(mockReadStream);

        // Mock crypto hash functions
        const mockHashUpdate = jest.fn();
        const mockHashDigest = jest.fn();
        const mockHashOn = jest.fn();

        const mockHash: MockedHash = {
            update: mockHashUpdate,
            digest: mockHashDigest,
            on: mockHashOn
        };

        (crypto.createHash as jest.Mock).mockReturnValue(mockHash);

        // Execute the function and expect it to reject with error
        await expect(calculateFileHashStreaming(filePath))
            .rejects.toThrow(`Failed to read file ${filePath}: ENOENT: File not found`);
    });

    it('should handle hash calculation errors', async () => {
        // Mock file path
        const filePath = '/path/to/file.txt';

        // Mock createReadStream
        const mockStreamOn = jest.fn((event: string, handler: any) => {
            if (event === 'data') {
                // Simulate a data event with the file content
                handler(Buffer.from('file content'));
            }
            return mockReadStream;
        });

        const mockReadStream: MockedStream = { on: mockStreamOn };
        (fs.createReadStream as jest.Mock).mockReturnValue(mockReadStream);

        // Mock crypto hash functions with hash error
        const mockHashUpdate = jest.fn().mockImplementation(() => {
            throw new Error('Hash calculation failed');
        });
        const mockHashDigest = jest.fn();
        const mockHashOn = jest.fn().mockImplementation((event: string, handler: any) => {
            if (event === 'error') {
                // Simulate a hash error event
                setTimeout(() => handler(new Error('Hash calculation failed')), 0);
            }
            return mockHash;
        });

        const mockHash: MockedHash = {
            update: mockHashUpdate,
            digest: mockHashDigest,
            on: mockHashOn
        };

        (crypto.createHash as jest.Mock).mockReturnValue(mockHash);

        // Execute function and expect it to reject with error
        await expect(calculateFileHashStreaming(filePath))
            .rejects.toThrow(`Failed to read file ${filePath}: Hash calculation failed`);
    });
});
