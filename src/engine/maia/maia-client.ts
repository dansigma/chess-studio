import type { MaiaPosition, MaiaResponse, MaiaResult } from "./protocol";

type Request = {
  position: MaiaPosition;
  resolve: (result: MaiaResult) => void;
  reject: (error: Error) => void;
};

function canceled() {
  return new DOMException("Maia analysis canceled", "AbortError");
}

export class MaiaClient {
  private worker: Worker | undefined;
  private current: Request | undefined;
  private queued: Request | undefined;
  private failure: Error | undefined;

  private readonly createWorker: () => Worker;

  constructor(createWorker = () => new Worker(
    new URL("./maia.worker.ts", import.meta.url),
    { type: "module", name: "maia" },
  )) {
    this.createWorker = createWorker;
  }

  analyze(position: MaiaPosition): Promise<MaiaResult> {
    return new Promise((resolve, reject) => {
      if (this.failure) {
        reject(this.failure);
        return;
      }
      this.queued?.reject(canceled());
      this.queued = { position, resolve, reject };
      this.dispatch();
    });
  }

  dispose() {
    this.fail(canceled());
  }

  private dispatch() {
    if (this.current || !this.queued) return;
    this.current = this.queued;
    this.queued = undefined;
    try {
      if (!this.worker) {
        this.worker = this.createWorker();
        this.worker.onmessage = ({ data }: MessageEvent<MaiaResponse>) => {
          if ("error" in data) {
            this.fail(new Error(data.error));
            return;
          }
          this.current?.resolve(data.result);
          this.current = undefined;
          this.dispatch();
        };
        this.worker.onerror = () => this.fail(new Error("Maia worker failed"));
        this.worker.onmessageerror = () => this.fail(new Error("Invalid Maia worker response"));
      }
      this.worker.postMessage(this.current.position);
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private fail(error: Error) {
    this.failure = error;
    this.worker?.terminate();
    this.worker = undefined;
    this.current?.reject(error);
    this.queued?.reject(error);
    this.current = undefined;
    this.queued = undefined;
  }
}
