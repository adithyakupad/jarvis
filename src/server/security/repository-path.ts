import { realpathSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";

export class InvalidRepositoryPathError extends Error {}

export function canonicalizeRepositoryPath(repositoryPath: string): string {
  if (!isAbsolute(repositoryPath)) {
    throw new InvalidRepositoryPathError("Repository path must be absolute.");
  }
  try {
    const canonicalPath = realpathSync.native(repositoryPath);
    if (!statSync(canonicalPath).isDirectory()) {
      throw new InvalidRepositoryPathError("Repository path must be a directory.");
    }
    return canonicalPath;
  } catch (error) {
    if (error instanceof InvalidRepositoryPathError) throw error;
    throw new InvalidRepositoryPathError(
      `Repository path '${repositoryPath}' does not exist or cannot be read.`,
    );
  }
}
