import "server-only";

/**
 * Chuyển async generator văn bản thành Response stream. Nếu người dùng đóng trang giữa chừng,
 * vẫn tiếp tục nhận hết đầu ra từ mô hình để lưu vào CSDL (onDone luôn được gọi).
 */
export function textStreamResponse(
  gen: AsyncGenerator<string>,
  opts: {
    headers?: Record<string, string>;
    onDone?: (fullText: string) => Promise<void>;
    onError?: (err: unknown, partial: string) => Promise<void>;
  } = {},
): Response {
  const encoder = new TextEncoder();
  let full = "";
  let clientGone = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const piece of gen) {
          full += piece;
          if (!clientGone) {
            try {
              controller.enqueue(encoder.encode(piece));
            } catch {
              clientGone = true;
            }
          }
        }
        await opts.onDone?.(full);
      } catch (err) {
        await opts.onError?.(err, full);
        if (!clientGone) {
          const msg = err instanceof Error ? err.message : String(err);
          try {
            controller.enqueue(encoder.encode(`\n\n[[ERROR]] ${msg}`));
          } catch {
            /* đã đóng */
          }
        }
      } finally {
        if (!clientGone) {
          try {
            controller.close();
          } catch {
            /* đã đóng */
          }
        }
      }
    },
    cancel() {
      clientGone = true;
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
      ...(opts.headers ?? {}),
    },
  });
}
