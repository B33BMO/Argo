import { toolRegistry } from './registry.js';
import { bashTool } from './bash.js';
import { readFileTool } from './read-file.js';
import { writeFileTool } from './write-file.js';
import { editFileTool } from './edit-file.js';
import { globTool } from './glob.js';
import { grepTool } from './grep.js';
import { listDirTool } from './list-dir.js';
import { curlTool } from './curl.js';

// Register all tools
toolRegistry.register(bashTool);
toolRegistry.register(readFileTool);
toolRegistry.register(writeFileTool);
toolRegistry.register(editFileTool);
toolRegistry.register(globTool);
toolRegistry.register(grepTool);
toolRegistry.register(listDirTool);
toolRegistry.register(curlTool);

export { toolRegistry } from './registry.js';
export type { Tool, ToolContext, ToolResult, ToolDefinition, JSONSchema } from './types.js';
export { toToolDefinition } from './types.js';
