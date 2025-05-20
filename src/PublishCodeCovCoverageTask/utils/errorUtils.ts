import * as tl from 'azure-pipelines-task-lib/task';
import { clearSensitiveEnvironmentVariables } from './environmentUtils';

/**
 * Error handler for unhandled rejections
 * @param err The error that was caught
 * @returns void
 */
export function handleUnhandledError(err: Error): void {
  // eslint-disable-next-line no-console
  console.error('Unhandled error:', err);
  // Clear sensitive environment variables on unhandled errors
  clearSensitiveEnvironmentVariables();
  tl.setResult(tl.TaskResult.Failed, `Unhandled error: ${err.message}`);
}
