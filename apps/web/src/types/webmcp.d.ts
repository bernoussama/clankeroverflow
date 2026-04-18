/** WebMCP draft; see https://webmachinelearning.github.io/webmcp/ */

interface ModelContextClient {
  requestUserInteraction: (callback: () => Promise<unknown>) => Promise<unknown>;
}

type WebMcpToolExecute = (input: object, client: ModelContextClient) => Promise<unknown>;

type WebMcpToolDefinition = {
  name: string;
  title?: string;
  description: string;
  inputSchema: object;
  execute: WebMcpToolExecute;
  annotations?: { readOnlyHint?: boolean };
};

type ModelContextRegisterToolOptions = {
  signal?: AbortSignal;
};

interface ModelContextNamespace {
  registerTool: (tool: WebMcpToolDefinition, options?: ModelContextRegisterToolOptions) => void;
}

interface Navigator {
  modelContext?: ModelContextNamespace;
}
