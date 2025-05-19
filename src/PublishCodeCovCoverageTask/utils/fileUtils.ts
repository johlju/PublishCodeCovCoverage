import * as fs from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

/**
 * Verifies a file's SHA-256 checksum against an expected value from a checksum file
 * Cross-platform alternative to shasum -a 256 -c <checksum_file>
 * Uses streaming approach to handle large files efficiently
 *
 * The function supports configurable logging through the optional logger parameter,
 * allowing it to be used in different contexts:
 * - Without logging: await verifyFileChecksum(filePath, checksumFilePath);
 * - With console logging: await verifyFileChecksum(filePath, checksumFilePath, console.log);
 * - With custom logging: await verifyFileChecksum(filePath, checksumFilePath, (msg) => myLogger.info(msg));
 *
 * @param filePath Path to the file to verify
 * @param checksumFilePath Path to the file containing checksums in format: "<hash> <filename>"
 * @param logger Optional function for logging messages (defaults to no logging if not provided)
 * @returns Promise that resolves when verification completes, rejects on error
 * @throws Error if verification fails, file not found, or other I/O errors occur
 */
export async function verifyFileChecksum(
    filePath: string,
    checksumFilePath: string,
    logger: (message: string) => void = () => {}
): Promise<void> {
    logger(`Verifying SHA-256 checksum for ${filePath} using Node.js crypto module`);

    let checksumFileContent: string;
    try {
        // Read the checksum file content asynchronously
        checksumFileContent = await fsPromises.readFile(checksumFilePath, 'utf8');
    } catch (error) {
        throw new Error(`Failed to read checksum file ${checksumFilePath}: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Parse the checksum file - format is typically: "<hash> <filename>"
    // Find the line that contains our exact filename (file basename)
    const fileName = path.basename(filePath);
    const checksumLine = checksumFileContent
        .split('\n')
        .find(line => {
            // Split by whitespace and check if any part matches the filename exactly
            const parts = line.trim().split(/\s+/);
            // The filename is typically the last part after spaces
            return parts.length > 1 && parts[parts.length - 1] === fileName;
        });

    if (!checksumLine) {
        throw new Error(`Checksum not found for ${fileName} in ${checksumFilePath}`);
    }

    // Extract expected hash - typically first part of the line
    const parts = checksumLine.trim().split(/\s+/);
    if (!parts[0]) {
        throw new Error(`Invalid checksum format for ${fileName} in ${checksumFilePath}`);
    }
    const expectedHash = parts[0].toLowerCase();

    // Calculate actual hash using a streaming approach
    try {
        const actualHash = await calculateFileHashStreaming(filePath);

        // Compare hashes
        if (actualHash !== expectedHash) {
            throw new Error(`SHA-256 checksum verification failed for ${filePath}:\nExpected: ${expectedHash}\nActual: ${actualHash}`);
        }

        logger(`SHA-256 checksum verified for ${filePath}`);
    } catch (error) {
        throw new Error(`Failed to verify checksum for ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Calculates the SHA-256 hash of a file using a streaming approach
 * This is more memory efficient for large files
 *
 * @param filePath Path to the file to hash
 * @returns Promise that resolves with the lowercase hex digest of the hash
 */
export function calculateFileHashStreaming(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        try {
            // Create a read stream from the file
            const fileStream = fs.createReadStream(filePath);
            const hashSum = crypto.createHash('sha256');

            // Handle stream events
            fileStream.on('error', (error) => {
                reject(new Error(`Failed to read file ${filePath}: ${error.message}`));
            });

            // Attach error handler to hashSum
            hashSum.on('error', (error) => {
                reject(new Error(`Hash calculation error: ${error.message}`));
            });

            fileStream.on('data', (chunk) => {
                hashSum.update(chunk);
            });

            fileStream.on('end', () => {
                const hash = hashSum.digest('hex').toLowerCase();
                resolve(hash);
            });
        } catch (error) {
            reject(new Error(`Failed to read file ${filePath}: ${error instanceof Error ? error.message : String(error)}`));
        }
    });
}
