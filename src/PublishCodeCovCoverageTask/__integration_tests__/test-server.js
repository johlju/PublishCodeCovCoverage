const http = require('http');
const path = require('path');
const fs = require('fs');

// Create a simple HTTP server that serves a file with controlled speed
// to test download progress functionality
const createTestServer = (port = 0) => {
    return new Promise((resolve) => {
        // Create a test file with some content
        const testFilePath = path.join(__dirname, 'test-file.txt');
        const fileSize = 1024 * 100; // 100KB file

        const fd = fs.openSync(testFilePath, 'w');
        // Create content with unique pattern to verify download integrity
        const blockSize = 1024;
        const numBlocks = fileSize / blockSize;

        for (let i = 0; i < numBlocks; i++) {
            const block = Buffer.alloc(blockSize, 0);
            // Fill with a pattern that includes the block number for verification
            block.write(`Block ${i.toString().padStart(6, '0')} of ${numBlocks}`, 0);
            fs.writeSync(fd, block);
        }
        fs.closeSync(fd);

        // Create server
        const server = http.createServer((req, res) => {
            const filePath = testFilePath;
            const stat = fs.statSync(filePath);

            // Set content length for proper progress reporting
            res.writeHead(200, {
                'Content-Length': stat.size,
                'Content-Type': 'text/plain'
            });

            // Stream the file with artificial delays to simulate slow network
            const fileStream = fs.createReadStream(filePath, { highWaterMark: 4096 });

            fileStream.on('data', (chunk) => {
                // Pause briefly to make progress events observable
                res.write(chunk);

                // Slow down the transfer to ensure progress events can be observed
                fileStream.pause();
                setTimeout(() => fileStream.resume(), 10);
            });

            fileStream.on('end', () => {
                res.end();
            });
        });

        server.listen(port, () => {
            const actualPort = server.address().port;
            console.log(`Test server listening on port ${actualPort}`);

            resolve({
                port: actualPort,
                url: `http://localhost:${actualPort}`,
                testFilePath,
                fileSize,
                close: () => {
                    server.close();
                    try {
                        if (fs.existsSync(testFilePath)) {
                            fs.unlinkSync(testFilePath);
                        }
                    } catch (err) {
                        console.warn(`Failed to clean up test file: ${err.message}`);
                    }
                }
            });
        });
    });
};

module.exports = { createTestServer };
