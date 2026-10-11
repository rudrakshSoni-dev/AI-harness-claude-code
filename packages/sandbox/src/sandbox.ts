import fs from "node:fs";
import path from "node:path";

export class SandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxError";
  }
}

export class Sandbox {
  readonly workspaceRoot: string;

  constructor(workspaceRoot: string) {
    if (!fs.existsSync(workspaceRoot)) {
      throw new SandboxError(`Workspace root does not exist: ${workspaceRoot}`);
    }
    this.workspaceRoot = fs.realpathSync(path.resolve(workspaceRoot));
  }

  /**
   * Resolves a target path inside the sandbox jail.
   * Throws SandboxError if the path escapes the workspace root.
   */
  resolve(targetPath: string): string {
    // 1. path.resolve(workspaceRoot, p)
    const absoluteAttempt = path.resolve(this.workspaceRoot, targetPath);

    // 2. fs.realpath the result (for files that don't exist yet, realpath nearest existing parent)
    const resolvedPath = this.resolveRealpath(absoluteAttempt);

    // 3. path.relative(workspaceRoot, resolved); reject if it starts with .. or is absolute
    const relative = path.relative(this.workspaceRoot, resolvedPath);

    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new SandboxError(`Path "${targetPath}" escapes workspace sandbox.`);
    }

    // 4. Compare case-insensitively on Windows and macOS
    const isCaseInsensitive = process.platform === "win32" || process.platform === "darwin";
    if (isCaseInsensitive) {
      const lowerRoot = this.workspaceRoot.toLowerCase();
      const lowerResolved = resolvedPath.toLowerCase();
      if (!lowerResolved.startsWith(lowerRoot)) {
        throw new SandboxError(`Path "${targetPath}" escapes workspace sandbox (case check).`);
      }
    }

    return resolvedPath;
  }

  /**
   * Converts a canonical resolved path to a clean relative path from the workspace root.
   */
  toRelative(resolvedPath: string): string {
    return path.relative(this.workspaceRoot, resolvedPath);
  }

  private resolveRealpath(target: string): string {
    if (fs.existsSync(target)) {
      return fs.realpathSync(target);
    }

    const unverifiedParts: string[] = [];
    let current = target;
    while (!fs.existsSync(current)) {
      const parent = path.dirname(current);
      if (parent === current) {
        throw new SandboxError(`Cannot resolve existing parent for: ${target}`);
      }
      unverifiedParts.unshift(path.basename(current));
      current = parent;
    }

    const realAncestor = fs.realpathSync(current);
    return path.join(realAncestor, ...unverifiedParts);
  }
}
