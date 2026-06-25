import path from 'path';

export class PathValidator {
  /**
   * Validates that the target path is strictly contained within the base directory.
   * Defends against null-byte injection, double URL decoding, and directory traversal.
   * 
   * @param baseDir The absolute path to the permitted base directory.
   * @param targetPath The user-supplied path to validate.
   * @returns The resolved absolute path if valid, or throws an Error.
   */
  public static validateContainment(baseDir: string, targetPath: string): string {
    // 1. Reject null bytes
    if (targetPath.indexOf('\0') !== -1) {
      throw new Error('SA-02 Security Violation: Null byte detected in path.');
    }

    // 2. Reject double URL decoding traversal (e.g. %252e%252e%252f)
    // Decode until it stops changing to catch nested encoding, but cap it to avoid infinite loops
    let decodedPath = targetPath;
    let prevPath = '';
    let iterations = 0;
    while (decodedPath !== prevPath && iterations < 5) {
      prevPath = decodedPath;
      try {
        decodedPath = decodeURIComponent(decodedPath);
      } catch (e) {
        // If it's malformed URI component, we just stick with what we have
        break;
      }
      iterations++;
    }
    
    // Now check for obvious traversal sequences even after decoding
    if (decodedPath.includes('../') || decodedPath.includes('..\\')) {
       // We still rely on path.resolve below, but we can catch it early or log it if needed
    }

    // 3. Resolve absolute paths
    const absoluteBase = path.resolve(baseDir);
    const resolvedTarget = path.resolve(absoluteBase, decodedPath);

    // 4. Strict prefix checking
    // Ensure the resolved target is exactly the base directory or inside it
    if (resolvedTarget !== absoluteBase && !resolvedTarget.startsWith(absoluteBase + path.sep)) {
      throw new Error(`SA-02 Security Violation: Path traversal detected. Access denied to ${targetPath}`);
    }

    return resolvedTarget;
  }
}
