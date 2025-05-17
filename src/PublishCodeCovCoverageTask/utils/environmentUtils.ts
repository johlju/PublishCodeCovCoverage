
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
 */
export function setTokenWasSetByTask(value: boolean): void {
    tokenWasSetByTask = value;
}

/**
 * Get the current state of the tokenWasSetByTask flag
 * @returns Boolean indicating whether the token was set by the task
 */
export function getTokenWasSetByTask(): boolean {
    return tokenWasSetByTask;
}
