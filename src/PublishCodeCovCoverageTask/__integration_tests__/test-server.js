const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

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
      // Check for timeout test path
      if (req.url === '/timeout-test') {
        console.log('Received request to timeout endpoint - will delay response');

        // Set a long delay that will exceed any reasonable timeout in tests
        const longDelay = 5000; // 5 seconds delay

        setTimeout(() => {
          // This response will only be sent after the delay
          // By then, the client should have already timed out
          res.writeHead(200, {
            'Content-Length': 20,
            'Content-Type': 'text/plain',
          });
          res.end('Delayed response data');
        }, longDelay);

        return; // Exit early to apply the delay
      }

      const filePath = testFilePath;
      const stat = fs.statSync(filePath);

      // Set content length for proper progress reporting
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': 'text/plain',
      });

      // Stream the file with artificial delays to simulate slow network
      // For testing purposes, we explicitly set the chunk size to 4096 bytes (4KB)
      // In real-world scenarios, chunk sizes are dynamic and determined by the OS,
      // network conditions, and Node.js's internal buffering mechanisms
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

    // Note: http.Server.listen() can be detected as an "open handle" by Jest --detectOpenHandles
    // This is expected behavior and not a memory leak. The server is properly closed in the test's afterAll block.
    server.listen(port, () => {
      const actualPort = server.address().port;
      console.log(`Test server listening on port ${actualPort}`);

      resolve({
        port: actualPort,
        url: `http://localhost:${actualPort}`,
        timeoutUrl: `http://localhost:${actualPort}/timeout-test`,
        testFilePath,
        fileSize,
        close: () => {
          // Proper cleanup of server to minimize "open handle" warnings
          // This doesn't guarantee Jest won't detect the server handle,
          // but it ensures we're doing everything possible to clean up
          return new Promise((resolveClose) => {
            server.close(() => {
              // Use keep-alive-socket destruction as recommended for complete cleanup
              server.unref();

              try {
                if (fs.existsSync(testFilePath)) {
                  fs.unlinkSync(testFilePath);
                }
              } catch (err) {
                console.warn(`Failed to clean up test file: ${err.message}`);
              }

              resolveClose();
            });
          });
        },
      });
    });
  });
};

module.exports = { createTestServer };
