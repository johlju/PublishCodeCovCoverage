
/**
 * @module environmentUtils
 *
 * This module is responsible for managing sensitive environment variables used during the
 * CodeCov coverage publishing process. It provides functionality to safely handle, track,
 * and clean up security-critical environment variables like CODECOV_TOKEN.
 *
 * The module maintains internal state through the `tokenWasSetByTask` variable, which tracks
 * whether sensitive tokens were set by this task. This state is critical for security as it
 * ensures that:
 *
 * 1. We only remove environment variables that were explicitly set by our task, not ones
 *    that might have been present in the environment beforehand
 * 2. We can reliably clean up sensitive information after task execution, preventing token
 *    leakage into subsequent pipeline steps
 * 3. We maintain a clear audit trail of which security-sensitive operations were performed
 *
 * This module implements a secure pattern for managing sensitive environment variables in
 * CI/CD pipelines, where proper cleanup is essential to maintain the principle of least privilege
 * and prevent accidental exposure of sensitive credentials.
 */

/**
 * Track if we set the CODECOV_TOKEN
 */
let tokenWasSetByTask = false;

/**
 * Function to clear sensitive environment variables that were set by this task
 * @returns void
 */
export function clearSensitiveEnvironmentVariables(): void {
    if (tokenWasSetByTask && process.env.CODECOV_TOKEN) {
        console.log('Removing CODECOV_TOKEN environment variable for security');
        // Using delete instead of setting to empty string ('') because:
        // 1. It completely removes the variable from process.env rather than leaving it with an empty value
        // 2. It's better for security to remove all traces of sensitive variables
        // 3. It resets the environment to its original state if the variable wasn't present before
        // 4. An empty string might still be processed differently than a non-existent variable by some APIs
        // Note: Using 'delete' on process.env properties can cause de-optimization of the process.env object in Node.js
        // as it converts it from a hidden class to a dictionary mode. This is a conscious security vs. performance
        // trade-off, where we prioritize security by fully removing sensitive data over slight performance implications.
        delete process.env.CODECOV_TOKEN;
    }
}

/**
 * Set the token was set by task flag
 * @param value Boolean indicating whether the token was set by the task
 * @returns void
 * @throws Error if the value is not a boolean
 */
export function setTokenWasSetByTask(value: boolean): void {
    if (typeof value !== 'boolean') {
        throw new Error('Value for tokenWasSetByTask must be a boolean');
    }
    tokenWasSetByTask = value;
}

/**
 * Get the current state of the tokenWasSetByTask flag
 * @returns Boolean indicating whether the token was set by the task
 */
export function getTokenWasSetByTask(): boolean {
    return tokenWasSetByTask;
}
