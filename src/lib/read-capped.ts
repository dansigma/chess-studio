export class UpstreamPayloadTooLargeError extends Error {
  constructor(message = "Upstream response exceeds size limit") {
    super(message);
    this.name = "UpstreamPayloadTooLargeError";
  }
}

/**
 * Reads a Response body as text with a strict byte cap.
 * Rejects immediately if Content-Length header exceeds maxBytes.
 * Streams the body tracking cumulative chunk byteLength, cancelling the reader
 * and rejecting if the total bytes exceed maxBytes.
 */
export async function readCapped(response: Response, maxBytes: number): Promise<string> {
  if (maxBytes < 0) {
    throw new UpstreamPayloadTooLargeError(`Invalid maxBytes limit: ${maxBytes}`);
  }

  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader !== null) {
    const parsedLength = parseInt(contentLengthHeader, 10);
    if (!Number.isNaN(parsedLength) && parsedLength > maxBytes) {
      throw new UpstreamPayloadTooLargeError(
        `Upstream Content-Length (${parsedLength}) exceeds limit of ${maxBytes} bytes`,
      );
    }
  }

  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let result = "";
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          throw new UpstreamPayloadTooLargeError(
            `Upstream response body exceeded limit of ${maxBytes} bytes`,
          );
        }
        result += decoder.decode(value, { stream: true });
      }
    }
    result += decoder.decode();
    return result;
  } catch (error) {
    try {
      await reader.cancel();
    } catch {
      // Ignore secondary error on cancel
    }
    throw error;
  }
}
