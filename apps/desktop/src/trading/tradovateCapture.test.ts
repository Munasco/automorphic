import { describe, it, expect } from "vite-plus/test";
import { tradovateTarget, tradovateAuthorization, tradovateBearer } from "./tradovateCapture.ts";
const token = "test-session-token-no-real-credential-123456";
describe("Tradovate sign-in capture", () => {
  it("accepts only exact account API hosts and secure transport", () => {
    expect(tradovateTarget("wss://demo.tradovateapi.com/v1/websocket")).toBe("demo");
    expect(tradovateTarget("https://live.tradovateapi.com/v1/account/list")).toBe("live");
    for (const url of [
      "http://demo.tradovateapi.com/v1",
      "https://demo.tradovateapi.com.evil.test",
      "https://evil.test/?host=live.tradovateapi.com",
      "https://md.tradovateapi.com",
      "https://user@live.tradovateapi.com",
      "https://live.tradovateapi.com:999/v1",
    ])
      expect(tradovateTarget(url)).toBeNull();
  });
  it("captures only an explicit WebSocket authorize frame", () => {
    expect(tradovateAuthorization(`authorize\n2\n\n${token}`)).toBe(token);
    expect(tradovateAuthorization(`order/placeorder\n2\n\n${token}`)).toBeNull();
    expect(tradovateAuthorization('{"password":"private"}')).toBeNull();
  });
  it("reads bearer authorization without reading passwords or cookies", () => {
    expect(tradovateBearer({ Authorization: `Bearer ${token}` })).toBe(token);
    expect(tradovateBearer({ Cookie: token, password: token })).toBeNull();
  });
});
