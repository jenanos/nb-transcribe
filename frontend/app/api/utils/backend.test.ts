import { sanitizeHeaders } from "./backend";

describe("sanitizeHeaders", () => {
  it("removes hop-by-hop headers including content encoding", () => {
    const upstreamHeaders = new Headers({
      "content-length": "123",
      "transfer-encoding": "chunked",
      connection: "keep-alive",
      "content-encoding": "gzip",
      "content-type": "application/json",
    });

    const sanitized = sanitizeHeaders(upstreamHeaders);

    expect(sanitized.has("content-length")).toBe(false);
    expect(sanitized.has("transfer-encoding")).toBe(false);
    expect(sanitized.has("connection")).toBe(false);
    expect(sanitized.has("content-encoding")).toBe(false);
    expect(sanitized.get("content-type")).toBe("application/json");
  });
});
