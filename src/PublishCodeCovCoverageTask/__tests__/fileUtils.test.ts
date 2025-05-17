import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'node:crypto';
import { verifyFileChecksum } from '../utils/fileUtils';

// Mock fs and crypto modules
jest.mock('fs');
jest.mock('path');
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

    it('should return true for valid checksum', () => {
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

        // Mock crypto hash functions
        const mockHashUpdate = jest.fn().mockReturnThis();
        const mockHashDigest = jest.fn().mockReturnValue('abcdef1234567890');

        (crypto.createHash as jest.Mock).mockReturnValue({
            update: mockHashUpdate,
            digest: mockHashDigest
        });

        // Execute function and check result
        const result = verifyFileChecksum(filePath, checksumFilePath);

        // Verify result and function calls
        expect(result).toBe(true);
        expect(fs.readFileSync).toHaveBeenCalledWith(checksumFilePath, 'utf8');
        expect(fs.readFileSync).toHaveBeenCalledWith(filePath);
        expect(crypto.createHash).toHaveBeenCalledWith('sha256');
        expect(mockHashUpdate).toHaveBeenCalledWith(Buffer.from('file content'));
        expect(mockHashDigest).toHaveBeenCalledWith('hex');
    });

    it('should throw error when checksum file does not contain the filename', () => {
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
        expect(() => {
            verifyFileChecksum(filePath, checksumFilePath);
        }).toThrow(`Checksum not found for file.txt in ${checksumFilePath}`);
    });

    it('should throw error when calculated hash does not match expected hash', () => {
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

        // Mock crypto hash functions to return a different hash than expected
        const mockHashUpdate = jest.fn().mockReturnThis();
        const mockHashDigest = jest.fn().mockReturnValue('actual0987654321');

        (crypto.createHash as jest.Mock).mockReturnValue({
            update: mockHashUpdate,
            digest: mockHashDigest
        });

        // Execute function and expect error
        expect(() => {
            verifyFileChecksum(filePath, checksumFilePath);
        }).toThrow(`SHA-256 checksum verification failed for ${filePath}:\nExpected: expected1234567890\nActual: actual0987654321`);
    });

    it('should not match partial filenames', () => {
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
        expect(() => {
            verifyFileChecksum(filePath, checksumFilePath);
        }).toThrow(`Checksum not found for file.txt in ${checksumFilePath}`);
    });
});
