// T06: verify the real streaming reader's byte cap independently from final-answer schema limits.
import test from "node:test";
import assert from "node:assert/strict";
import { readLimitedResponse } from "../../server/ai/geminiTransport.ts";
import { ProviderFailure } from "../../server/ai/shopAdvice.ts";

test("T06 streaming provider body accepts exactly 16 KiB and cancels one byte past the cap", async () => {
  const exact = JSON.stringify("x".repeat(16_382));
  assert.equal(Buffer.byteLength(exact), 16_384);
  assert.equal(await readLimitedResponse(new Response(exact)), "x".repeat(16_382));
  let cancelled = false;
  const chunks = [new TextEncoder().encode(exact), new TextEncoder().encode(" ")];
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks.shift();
      if (chunk) controller.enqueue(chunk);
      // Keep the stream open so the tested reader must actively cancel it on overflow.
    },
    cancel() { cancelled = true; },
  });
  await assert.rejects(readLimitedResponse(new Response(stream)), (error: unknown) =>
    error instanceof ProviderFailure && error.errorClass === "response_too_large");
  assert.equal(cancelled, true, "oversize streaming input is cancelled before JSON parsing");
  // The cap is bytes, not JS characters: this input is shorter in UTF-16 but larger in UTF-8.
  const unicode = JSON.stringify("ž".repeat(8_192));
  assert.ok(unicode.length < 16_384 && Buffer.byteLength(unicode) > 16_384);
  await assert.rejects(readLimitedResponse(new Response(unicode)), (error: unknown) =>
    error instanceof ProviderFailure && error.errorClass === "response_too_large");
});
