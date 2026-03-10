import ts from "typescript";
import path from "node:path";
import fs from "node:fs";

const serviceCache = new Map<string, ts.LanguageService>();
const fileVersions = new Map<string, number>();

/**
 * Get or create a LanguageService for the project containing `filePath`.
 * Discovers tsconfig.json by walking up from the file's directory.
 * Caches one LanguageService per project root (tsconfig directory or file directory).
 */
export function getLanguageService(filePath: string): ts.LanguageService {
  const absPath = path.resolve(filePath);
  const dir = path.dirname(absPath);

  // Discover tsconfig.json
  const configPath = ts.findConfigFile(dir, ts.sys.fileExists, "tsconfig.json");

  let compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
  };
  let fileNames: string[] = [absPath];
  let projectRoot = dir;

  if (configPath) {
    projectRoot = path.dirname(configPath);
    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    if (!configFile.error) {
      const parsed = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        projectRoot,
        undefined,
        configPath,
      );
      compilerOptions = parsed.options;
      fileNames = parsed.fileNames;

      // Ensure the requested file is always included
      if (!fileNames.includes(absPath)) {
        fileNames.push(absPath);
      }
    }
  }

  // Cache key is the project root
  const cacheKey = projectRoot;
  const cached = serviceCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Create LanguageServiceHost
  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => fileNames,
    getScriptVersion: (fileName: string) => String(fileVersions.get(fileName) ?? 0),
    getScriptSnapshot: (fileName: string) => {
      if (!fs.existsSync(fileName)) return undefined;
      return ts.ScriptSnapshot.fromString(fs.readFileSync(fileName, "utf-8"));
    },
    getCurrentDirectory: () => projectRoot,
    getCompilationSettings: () => compilerOptions,
    getDefaultLibFileName: (opts: ts.CompilerOptions) =>
      ts.getDefaultLibFilePath(opts),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  };

  const service = ts.createLanguageService(host, ts.createDocumentRegistry());
  serviceCache.set(cacheKey, service);
  return service;
}

/**
 * Notify that a file has changed on disk.
 * Increments the per-file version so the LanguageService re-reads it.
 */
export function notifyFileChanged(filePath: string): void {
  const absPath = path.resolve(filePath);
  const current = fileVersions.get(absPath) ?? 0;
  fileVersions.set(absPath, current + 1);
}
