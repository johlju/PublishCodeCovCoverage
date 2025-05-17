import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'node:crypto';

/**
 * Verifies a file's SHA-256 checksum against an expected value from a checksum file
 * Cross-platform alternative to shasum -a 256 -c <checksum_file>
 *
 * @param filePath Path to the file to verify
 * @param checksumFilePath Path to the file containing checksums in format: "<hash> <filename>"
 * @returns true if verification passed, throws error otherwise
 */
export function verifyFileChecksum(filePath: string, checksumFilePath: string): boolean {
    console.log(`Verifying SHA-256 checksum for ${filePath} using Node.js crypto module`);

    // Read the checksum file content
    const checksumFileContent = fs.readFileSync(checksumFilePath, 'utf8');

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
    const expectedHash = checksumLine.trim().split(/\s+/)[0].toLowerCase();

    // Calculate actual hash
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    const actualHash = hashSum.digest('hex').toLowerCase();

    // Compare hashes
    if (actualHash !== expectedHash) {
        throw new Error(`SHA-256 checksum verification failed for ${filePath}:\nExpected: ${expectedHash}\nActual: ${actualHash}`);
    }

    console.log(`SHA-256 checksum verified for ${filePath}`);
    return true;
}
