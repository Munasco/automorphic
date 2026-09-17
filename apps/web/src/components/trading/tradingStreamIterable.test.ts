import { describe, expect, it, vi } from "vite-plus/test";
import { tradingStreamIterable } from "./tradingStreamIterable";

describe("trading snapshot iterator", () => {
  it("emits seed immediately, retains the latest unread snapshot and cleans up when aborted", async () => {
    const controller = new AbortController();
    let emit: (value: number) => void = () => {};
    const dispose = vi.fn();
    const stream = tradingStreamIterable(
      controller.signal,
      (next) => {
        emit = next;
        return dispose;
      },
      0,
    );
    expect(await stream.next()).toEqual({ value: 0, done: false });
    emit(1);
    emit(2);
    expect(await stream.next()).toEqual({ value: 2, done: false });
    const waiting = stream.next();
    controller.abort();
    expect(await waiting).toEqual({ value: undefined, done: true });
    expect(dispose).toHaveBeenCalledTimes(1);
    emit(3);
    expect(await stream.next()).toEqual({ value: undefined, done: true });
  });
  it("closes a source immediately when aborted between reads", async () => {
    const controller = new AbortController();
    const dispose = vi.fn();
    const stream = tradingStreamIterable(controller.signal, () => dispose, 0);
    await stream.next();
    controller.abort();
    expect(dispose).toHaveBeenCalledTimes(1);
    await stream.return(undefined);
    expect(dispose).toHaveBeenCalledTimes(1);
  });
  it("does not start a source when cancellation precedes subscription", async () => {
    const controller = new AbortController();
    controller.abort();
    const subscribe = vi.fn(() => vi.fn());
    expect(await tradingStreamIterable(controller.signal, subscribe, 0).next()).toEqual({
      value: undefined,
      done: true,
    });
    expect(subscribe).not.toHaveBeenCalled();
  });
});
