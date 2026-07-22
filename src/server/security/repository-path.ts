import { accessSync, constants, existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";

export class InvalidRepositoryPathError extends Error {}

export interface RepositoryMetadata {
  canonicalPath: string;
  directoryName: string;
  isGitRepository: boolean;
  currentBranch: string | null;
  commonFiles: string[];
}

const COMMON_FILES = ["README.md", "README", "package.json", "pyproject.toml", "requirements.txt", "Cargo.toml", "go.mod", "pom.xml", "build.gradle", "Makefile"];

function expandHome(input: string): string {
  if (input === "~") return homedir();
  if (input.startsWith("~/")) return join(homedir(), input.slice(2));
  return input;
}

function gitBranch(path: string): { isGit: boolean; branch: string | null } {
  const marker = join(path, ".git");
  if (!existsSync(marker)) return { isGit: false, branch: null };
  try {
    let gitDir = marker;
    if (!statSync(marker).isDirectory()) {
      const match = /^gitdir:\s*(.+)$/m.exec(readFileSync(marker, "utf8"));
      if (!match) return { isGit: true, branch: null };
      gitDir = resolve(path, match[1]);
    }
    const head = readFileSync(join(gitDir, "HEAD"), "utf8").trim();
    return { isGit: true, branch: head.startsWith("ref: refs/heads/") ? head.slice(16) : null };
  } catch { return { isGit: true, branch: null }; }
}

export function canonicalizeRepositoryPath(repositoryPath: string): string {
  const expanded = expandHome(repositoryPath.trim());
  if (!isAbsolute(expanded)) {
    throw new InvalidRepositoryPathError("Repository path must be absolute.");
  }
  if (!existsSync(expanded)) throw new InvalidRepositoryPathError(`Repository path '${repositoryPath}' does not exist.`);
  try {
    const canonicalPath = realpathSync.native(expanded);
    if (!statSync(canonicalPath).isDirectory()) {
      throw new InvalidRepositoryPathError("Repository path must be a directory.");
    }
    try { accessSync(canonicalPath, constants.R_OK | constants.X_OK); } catch { throw new InvalidRepositoryPathError(`Repository path '${repositoryPath}' cannot be read.`); }
    if (realpathSync.native(canonicalPath) !== canonicalPath) throw new InvalidRepositoryPathError("Repository path could not be resolved consistently.");
    return canonicalPath;
  } catch (error) {
    if (error instanceof InvalidRepositoryPathError) throw error;
    throw new InvalidRepositoryPathError(
      `Repository path '${repositoryPath}' cannot be read.`,
    );
  }
}

export function inspectRepositoryPath(repositoryPath: string): RepositoryMetadata {
  const canonicalPath = canonicalizeRepositoryPath(repositoryPath);
  const git = gitBranch(canonicalPath);
  return { canonicalPath, directoryName: basename(canonicalPath), isGitRepository: git.isGit, currentBranch: git.branch, commonFiles: COMMON_FILES.filter((file) => existsSync(join(canonicalPath, file))) };
}
