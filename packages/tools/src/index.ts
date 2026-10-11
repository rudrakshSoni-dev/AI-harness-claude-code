export * from "./tool.js";
export * from "./registry.js";
export { listDirTool, ListDirArgs } from "./tools/list_dir.js";
export { readFileTool, ReadFileArgs } from "./tools/read_file.js";
export { searchTool, SearchArgs } from "./tools/search.js";
export { writeFileTool, createWriteFileTool, WriteFileArgs } from "./tools/write_file.js";
export { runCmdTool, RunCmdArgs } from "./tools/run_cmd.js";

import { ToolRegistry } from "./registry.js";
import { listDirTool } from "./tools/list_dir.js";
import { readFileTool } from "./tools/read_file.js";
import { searchTool } from "./tools/search.js";
import { createWriteFileTool } from "./tools/write_file.js";
import { runCmdTool } from "./tools/run_cmd.js";

export function createDefaultRegistry(options: { yesWrites?: boolean } = {}): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(listDirTool);
  registry.register(readFileTool);
  registry.register(searchTool);
  registry.register(createWriteFileTool({ yesWrites: options.yesWrites }));
  registry.register(runCmdTool);
  return registry;
}
