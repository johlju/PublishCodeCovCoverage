/// <reference path="../../../types/azure-pipelines-task-lib/task.d.ts" />
import { createRequire as _createRequire } from "module";
const __require = _createRequire(import.meta.url);
const tl = __require("azure-pipelines-task-lib/task");
import { clearSensitiveEnvironmentVariables } from './environmentUtils.js';
import logger from './logger.js';
/**
 * Error handler for unhandled rejections
 * @param err The error that was caught
 * @returns void
 */
export function handleUnhandledError(err) {
    logger.error('Unhandled error:', err);
    // Clear sensitive environment variables on unhandled errors
    clearSensitiveEnvironmentVariables();
    tl.setResult(tl.TaskResult.Failed, `Unhandled error: ${err.message}`);
}
