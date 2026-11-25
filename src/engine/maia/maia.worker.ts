import { dependencies } from "../../../package.json";
import { env, InferenceSession, Tensor } from "onnxruntime-web/wasm";
import { BOARD_SQUARES, TOKEN_WIDTH } from "./encode";
import { analyzeMaia, type RunMaiaModel } from "./inference";
import type { MaiaPosition, MaiaResponse } from "./protocol";

env.wasm.numThreads = 1;
env.wasm.proxy = false;
const runtime = new URL(`/engine/maia/ort/${dependencies["onnxruntime-web"]}/`, self.location.origin);
env.wasm.wasmPaths = {
  mjs: new URL("ort-wasm-simd-threaded.mjs", runtime).href,
  wasm: new URL("ort-wasm-simd-threaded.wasm", runtime).href,
};

let session: Promise<InferenceSession> | undefined;

const run: RunMaiaModel = async (tokens, batch, elo, output) => {
  session ??= InferenceSession.create("/engine/maia/maia3-5m.onnx", { executionProviders: ["wasm"] });
  const model = await session;
  const rating = new Tensor("int64", new BigInt64Array(batch).fill(BigInt(elo)), [batch]);
  const result = await model.run({
    tokens: new Tensor("float32", tokens, [batch, BOARD_SQUARES, TOKEN_WIDTH]),
    self_elo: rating,
    oppo_elo: rating,
  }, [output]);
  return result[output].data as Float32Array;
};

self.onmessage = async ({ data }: MessageEvent<MaiaPosition>) => {
  let response: MaiaResponse;
  try {
    response = { result: await analyzeMaia(data, run) };
  } catch (error) {
    response = { error: error instanceof Error ? error.message : String(error) };
  }
  self.postMessage(response);
};
