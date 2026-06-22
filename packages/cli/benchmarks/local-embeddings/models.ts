import { createHash } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import type { ModelKey } from "./types";

export type BenchmarkModel = {
  key: ModelKey;
  label: string;
  fileName: string;
  url: string;
  sha256: string;
  size: number;
  dimensions: number;
};

export const BENCHMARK_MODELS: Record<ModelKey, BenchmarkModel> = {
  qwen: {
    key: "qwen",
    label: "Qwen3-Embedding-0.6B Q4_K_M",
    fileName: "Qwen3-Embedding-0.6B.Q4_K_M.gguf",
    url: "https://huggingface.co/mradermacher/Qwen3-Embedding-0.6B-GGUF/resolve/8c605f43dcb0b43cf6e4afc7203888d912a67ace/Qwen3-Embedding-0.6B.Q4_K_M.gguf",
    sha256: "793cb15c8e0da4fe29f32ae0b3d604a92a9b1ecf5048cbfd65107faa38108b83",
    size: 396_475_040,
    dimensions: 1024,
  },
  nomic: {
    key: "nomic",
    label: "nomic-embed-text-v1.5 Q4_K_M",
    fileName: "nomic-embed-text-v1.5.Q4_K_M.gguf",
    url: "https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/0188c9bf409793f810680a5a431e7b899c46104c/nomic-embed-text-v1.5.Q4_K_M.gguf",
    sha256: "d4e388894e09cf3816e8b0896d81d265b55e7a9fff9ab03fe8bf4ef5e11295ac",
    size: 84_106_624,
    dimensions: 768,
  },
  bge: {
    key: "bge",
    label: "bge-small-en-v1.5 Q8_0",
    fileName: "bge-small-en-v1.5-q8_0.gguf",
    url: "https://huggingface.co/ggml-org/bge-small-en-v1.5-Q8_0-GGUF/resolve/f2068edd9b54f2a369549ccc71f70ed273a2a801/bge-small-en-v1.5-q8_0.gguf",
    sha256: "f046db1dc724cf4f6f0a0c5917e922823b73eb1d27b8f9a9c2797f7866974804",
    size: 36_685_152,
    dimensions: 384,
  },
  granite: {
    key: "granite",
    label: "granite-embedding-107m-multilingual Q4_K_M",
    fileName: "granite-embedding-107m-multilingual-Q4_K_M.gguf",
    url: "https://huggingface.co/lmstudio-community/granite-embedding-107m-multilingual-GGUF/resolve/fe02f2818f3aefb661ec656cab3be19024e40acd/granite-embedding-107m-multilingual-Q4_K_M.gguf",
    sha256: "4a0115de29aeeedc73175f14c6e2eee9da1d4b586cbe4c1e95b68b7e36aff36a",
    size: 117_011_136,
    dimensions: 384,
  },
};

export async function fileSha256(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export async function ensureModel(model: BenchmarkModel, cacheDir: string) {
  const modelPath = join(cacheDir, model.fileName);
  if (existsSync(modelPath) && (await fileSha256(modelPath)) === model.sha256) return modelPath;

  mkdirSync(dirname(modelPath), { recursive: true });
  const temporaryPath = `${modelPath}.tmp-${process.pid}`;
  rmSync(temporaryPath, { force: true });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5 * 60_000);
  try {
    const response = await fetch(model.url, { signal: controller.signal });
    if (!response.ok || !response.body) {
      throw new Error(`Unable to download ${model.label} (${response.status})`);
    }
    await pipeline(Readable.fromWeb(response.body as any), createWriteStream(temporaryPath));
  } catch (error) {
    rmSync(temporaryPath, { force: true });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const actualHash = await fileSha256(temporaryPath);
  if (actualHash !== model.sha256) {
    rmSync(temporaryPath, { force: true });
    throw new Error(
      `Checksum mismatch for ${model.fileName}: expected ${model.sha256}, got ${actualHash}`,
    );
  }
  renameSync(temporaryPath, modelPath);
  return modelPath;
}
