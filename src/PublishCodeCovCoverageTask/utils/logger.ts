import winston from 'winston';
import Transport from 'winston-transport';
import * as tl from 'azure-pipelines-task-lib/task';

// Detect if running in Azure Pipelines (by common agent env vars)
const isAzure = !!process.env.AGENT_ID || !!process.env.AGENT_NAME;
const isTest = process.env.NODE_ENV === 'test';

// Custom transport for Azure Pipelines
interface LogInfo {
  [key: string]: unknown;
  level: 'error' | 'warn' | 'info' | 'debug' | string;
  message: string;
}

class AzurePipelineTransport extends Transport {
  log(info: LogInfo, callback: () => void): void {
    setImmediate(() => {
      if (info.level === 'error') {
        tl.error(info.message);
      } else if (info.level === 'warn') {
        tl.warning(info.message);
      } else if (info.level === 'debug') {
        tl.debug(info.message);
      } else {
        tl.debug(info.message); // Default to debug for info/verbose
      }
    });
    callback();
  }
}

const transports =
  isAzure && !isTest
    ? [new AzurePipelineTransport()]
    : [
        new winston.transports.Console({
          format: winston.format.simple(),
        }),
      ];

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${String(timestamp)}] ${String(level)}: ${String(message)}`;
    })
  ),
  transports,
});

export default logger;
export { AzurePipelineTransport }; // Export for direct testing
