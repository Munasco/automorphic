import { afterEach, expect, it, vi } from "vite-plus/test";
import { readDesktopAccount } from "./desktop";

afterEach(() => vi.unstubAllGlobals());

it("shares concurrent desktop verification, then checks again instead of retaining a signed-out user", async () => {
  const user = { id: "one", name: "Trader", email: "trader@example.test", emailVerified: true };
  let resolve!: (value: typeof user | null) => void;
  const getUser = vi.fn(
    () =>
      new Promise<typeof user | null>((done) => {
        resolve = done;
      }),
  );
  vi.stubGlobal("window", { getUser });
  const first = readDesktopAccount();
  const second = readDesktopAccount();
  expect(getUser).toHaveBeenCalledOnce();
  resolve(user);
  expect(await first).toEqual(user);
  expect(await second).toEqual(user);
  const afterSignOut = readDesktopAccount();
  expect(getUser).toHaveBeenCalledTimes(2);
  resolve(null);
  expect(await afterSignOut).toBeNull();
});
