export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface GenerateOptions {
  system: string;
  messages: ChatTurn[];
  model: string;
  temperature: number;
  maxTokens: number;
  signal?: AbortSignal;
}

export interface GenerationChunk {
  type: "text" | "done" | "error";
  text?: string;
  tokensIn?: number;
  tokensOut?: number;
  finishReason?: string;
  message?: string;
}

export interface AIProvider {
  readonly name: string;
  /** Streams a reply as a sequence of chunks, ending with `done` or `error`. */
  stream(options: GenerateOptions): AsyncGenerator<GenerationChunk>;
  /** One-shot completion, used for summarisation and titles. */
  complete(options: GenerateOptions): Promise<string>;
}
