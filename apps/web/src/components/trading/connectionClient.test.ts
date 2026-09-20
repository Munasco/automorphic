import { describe, expect, it } from "vite-plus/test";
import { readConnectionResponse } from "./connectionClient";

describe("connection responses", () => {
  it("turns missing routes and empty successful responses into actionable errors", async () => {
    for (const status of [200, 404, 503]) {
      await expect(readConnectionResponse(new Response("", { status }))).rejects.toThrow(
        "connection service is unavailable",
      );
    }
    await expect(
      readConnectionResponse(new Response("<html>Unavailable</html>", { status: 502 })),
    ).rejects.toThrow("Please try again");
  });
  it("distinguishes expired sessions from connection failures", async () => {
    await expect(readConnectionResponse(new Response("", { status: 401 }))).rejects.toThrow(
      "Sign in again",
    );
    await expect(readConnectionResponse(new Response("", { status: 403 }))).rejects.toThrow(
      "permission",
    );
  });
  it("preserves useful server errors and valid channel responses", async () => {
    await expect(
      readConnectionResponse(
        Response.json({ error: "That Telegram code is incorrect." }, { status: 400 }),
      ),
    ).rejects.toThrow("code is incorrect");
    expect(await readConnectionResponse(Response.json([]))).toEqual([]);
    expect(await readConnectionResponse(Response.json({ connected: true }))).toEqual({
      connected: true,
    });
  });
});
