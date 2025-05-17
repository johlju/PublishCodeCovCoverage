/**
 * Helper function to properly quote a command line argument
 * Escapes quotes and backslashes, then wraps the string in quotes
 * @param arg The argument to quote
 * @returns The quoted argument
 */
export function quoteCommandArgument(arg: string): string {
    // Escape backslashes and quotes
    const escaped = arg.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    // Wrap in quotes
    return `"${escaped}"`;
}
