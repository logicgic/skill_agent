import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DocumentCatalog, SupportedDocumentType } from "./chat/document-router.js";

/**
 * 基于当前模块 URL 推导后端根目录（兼容 src 与 dist）。
 */
export const resolveBackendRootFromModuleUrl = (moduleUrl: string): string => {
  const moduleDirectory = path.dirname(fileURLToPath(moduleUrl));
  return path.resolve(moduleDirectory, "..");
};

/**
 * 返回后端 .env 文件绝对路径。
 */
export const resolveBackendEnvPath = (projectRoot: string): string => path.join(projectRoot, ".env");

/**
 * 返回 files 目录绝对路径。
 */
export const resolveFilesDirectory = (projectRoot: string): string => path.join(projectRoot, "files");

/**
 * 确保目标路径在指定根目录内，防止路径逃逸。
 */
export const assertPathInsideRoot = (rootPath: string, targetPath: string, message: string): string => {
  const absoluteTargetPath = path.resolve(rootPath, targetPath);
  const relativePath = path.relative(rootPath, absoluteTargetPath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(message);
  }
  return absoluteTargetPath;
};

/**
 * 解析脚本参数中的占位符，统一映射为 files 目录下真实路径。
 */
export const resolveScriptArgPlaceholders = (
  args: string[],
  input: { projectRoot: string; catalog: DocumentCatalog },
): string[] => {
  const filesDirectory = resolveFilesDirectory(input.projectRoot);
  const firstPdf = input.catalog.byType.pdf[0]?.absolutePath;
  const firstDocx = input.catalog.byType.docx[0]?.absolutePath;
  const firstXlsx = input.catalog.byType.xlsx[0]?.absolutePath;
  const defaultOutputJson = path.join(filesDirectory, "parsed", "pdf", "auto-output.json");
  const defaultOutputDir = path.join(filesDirectory, "parsed", "docx", "auto-output");

  const requireDocument = (token: string, type: SupportedDocumentType, value: string | undefined): string => {
    if (value) {
      return value;
    }
    throw new Error(`脚本参数包含 ${token}，但 files 目录中未找到 ${type.toUpperCase()} 文档`);
  };

  const replaceToken = (
    source: string,
    token: string,
    replacementFactory: () => string,
  ): string => (source.includes(token) ? source.replaceAll(token, replacementFactory()) : source);

  return args.map((arg) => {
    let resolvedArg = arg;
    resolvedArg = replaceToken(resolvedArg, "{FILE_PDF}", () =>
      requireDocument("{FILE_PDF}", "pdf", firstPdf),
    );
    resolvedArg = replaceToken(resolvedArg, "{FILE_DOCX}", () =>
      requireDocument("{FILE_DOCX}", "docx", firstDocx),
    );
    resolvedArg = replaceToken(resolvedArg, "{FILE_XLSX}", () =>
      requireDocument("{FILE_XLSX}", "xlsx", firstXlsx),
    );
    resolvedArg = replaceToken(resolvedArg, "{OUTPUT_JSON}", () => defaultOutputJson);
    resolvedArg = replaceToken(resolvedArg, "{OUTPUT_DIR}", () => defaultOutputDir);
    return resolvedArg;
  });
};
