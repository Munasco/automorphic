import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Schema from "effect/Schema";
import { TelegramChannel, TelegramChannelMessage } from "@t3tools/contracts";
import {
  BellIcon,
  BellOffIcon,
  SendIcon,
  SearchIcon,
  ExternalLinkIcon,
  LoaderCircleIcon,
} from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import { TelegramSignIn } from "./BrokerConnections";
import { connectionRequest, useTradingConnections } from "./connectionClient";
import { tradingQueryScope } from "./tradingQueries";
import { openTradingStream } from "./tradingTransport";
import { useAlertNotifications } from "./useAlertNotifications";

export function TelegramPanel({
  visible,
  projectId,
}: {
  visible: boolean;
  projectId: string | null;
}) {
  const connection = useTradingConnections(),
    client = useQueryClient();
  const scope = tradingQueryScope(),
    scopeKey = scope.join("|"),
    connected = connection.data?.telegram.connected === true;
  const storageKey = `automorphic:telegram:v1:${scopeKey}:${projectId ?? "default"}`;
  const [active, setActive] = useState(""),
    [search, setSearch] = useState(""),
    [notice, setNotice] = useState(""),
    [streamState, setStreamState] = useState("Connecting…");
  const [watched, setWatched] = useState<string[]>(() => {
    try {
      const ids: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
      return Array.isArray(ids)
        ? ids
            .filter((id): id is string => typeof id === "string" && /^\d{1,20}$/.test(id))
            .slice(0, 100)
        : [];
    } catch {
      return [];
    }
  });
  const [desktop, setDesktop] = useState(false);
  const feed = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const { prepare, deliver } = useAlertNotifications(false);
  const seen = useRef(new Set<string>());
  const channels = useQuery({
    queryKey: [...scope, "telegram", "channels"],
    queryFn: async ({ signal }) =>
      Schema.decodeUnknownSync(Schema.Array(TelegramChannel))(
        await connectionRequest("telegram/channels", undefined, signal),
      ),
    enabled: connected,
    staleTime: 60_000,
    retry: false,
  });
  const selected = channels.data?.find((c) => c.id === active) ?? channels.data?.[0];
  const selectedId = selected?.id ?? "";
  const messages = useQuery({
    queryKey: [...scope, "telegram", "messages", selectedId],
    queryFn: async ({ signal }) => {
      const history = Schema.decodeUnknownSync(Schema.Array(TelegramChannelMessage))(
        await connectionRequest(
          `telegram/messages?channelId=${encodeURIComponent(selectedId)}`,
          undefined,
          signal,
        ),
      );
      // A live post may arrive while history is loading. Keep those newer messages.
      const current =
        client.getQueryData<readonly TelegramChannelMessage[]>([
          ...scope,
          "telegram",
          "messages",
          selectedId,
        ]) ?? [];
      return [...new Map([...history, ...current].map((message) => [message.id, message])).values()]
        .sort((a, b) => a.id - b.id)
        .slice(-100);
    },
    enabled: connected && visible && !!selectedId,
    retry: false,
    staleTime: 15_000,
  });
  const watchedKey = watched.slice().sort().join(",");
  useEffect(() => {
    followLatest.current = true;
  }, [selectedId]);
  useEffect(() => {
    if (visible && followLatest.current && feed.current)
      feed.current.scrollTop = feed.current.scrollHeight;
  }, [messages.data, selectedId, visible]);
  const streamIds = useMemo(
    () =>
      Array.from(new Set([...watched, ...(visible && selectedId ? [selectedId] : [])]))
        .sort()
        .join(","),
    [watched, visible, selectedId],
  );
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(watched));
    } catch {
      setNotice("Channel preferences could not be saved in this browser.");
    }
  }, [storageKey, watched]);
  useEffect(() => {
    if (!connected) {
      client.removeQueries({ queryKey: [...tradingQueryScope(), "telegram"] });
      return;
    }
    if (!streamIds) return;
    let stopped = false,
      retry: ReturnType<typeof setTimeout> | undefined,
      close: (() => void) | undefined,
      attempt = 0;
    const openedAt = Math.floor(Date.now() / 1000);
    const connect = () => {
      setStreamState(attempt ? "Reconnecting…" : "Listening for signal alerts");
      const stream = openTradingStream(
        `/api/trading/telegram/events?channels=${encodeURIComponent(streamIds)}`,
        {
          onMessage: (data) => {
            let message: TelegramChannelMessage;
            try {
              message = Schema.decodeUnknownSync(TelegramChannelMessage)(JSON.parse(data));
            } catch {
              return;
            }
            if (stopped) return;
            attempt = 0;
            setStreamState("Connected");
            const id = `${message.channelId}:${message.id}`;
            if (seen.current.has(id)) return;
            seen.current.add(id);
            if (seen.current.size > 2000) seen.current.delete(seen.current.values().next().value!);
            client.setQueryData<readonly TelegramChannelMessage[]>(
              [...tradingQueryScope(), "telegram", "messages", message.channelId],
              (previous) => {
                const items = [...(previous ?? []).filter((m) => m.id !== message.id), message];
                return items.sort((a, b) => a.id - b.id).slice(-100);
              },
            );
            if (watched.includes(message.channelId) && message.date >= openedAt) {
              const channel = channels.data?.find((c) => c.id === message.channelId);
              deliver({
                id: `telegram:${id}`,
                title: channel?.title ?? "Telegram channel",
                body:
                  message.text.slice(0, 240) ||
                  (message.media ? "New attachment" : "New channel post"),
                notifications: { toast: true, sound: false, desktop },
              });
            }
          },
          onError: (failure) => {
            if (stopped) return;
            if (failure?.kind === "http" && [401, 403].includes(failure.status)) {
              setStreamState("Reconnect Telegram in Trading settings");
              void connection.refetch();
              return;
            }
            setStreamState("Reconnecting…");
            retry = setTimeout(connect, Math.min(30_000, 2000 * 2 ** Math.min(attempt++, 4)));
          },
        },
      );
      close = stream.close;
    };
    connect();
    return () => {
      stopped = true;
      close?.();
      if (retry) clearTimeout(retry);
    };
  }, [connected, streamIds, watchedKey, desktop, scopeKey, client, deliver, channels.data]);
  const list =
    channels.data?.filter((c) => c.title.toLowerCase().includes(search.toLowerCase())) ?? [];
  return (
    <div
      hidden={!visible}
      className={cn(
        "@container min-h-0 flex-1 flex-col overflow-hidden",
        visible ? "flex" : "hidden",
      )}
    >
      {!connected ? (
        <div className="m-auto max-h-full w-full max-w-sm space-y-5 overflow-y-auto p-6">
          <div className="flex size-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
            <SendIcon className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-medium">Your signals, where you trade.</h2>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Connect Telegram, choose your signal channels, and receive alerts as they arrive.
            </p>
          </div>
          {connection.isPending ? (
            <p className="text-xs text-muted-foreground">Checking connection…</p>
          ) : connection.error ? (
            <div className="space-y-3">
              <p role="alert" className="text-xs text-red-400">
                {connection.error.message}
              </p>
              <button
                type="button"
                className="rounded-md bg-muted px-3 py-2 text-xs hover:bg-muted/70"
                disabled={connection.isFetching}
                onClick={() => void connection.refetch()}
              >
                {connection.isFetching ? "Trying again…" : "Try again"}
              </button>
            </div>
          ) : (
            <TelegramSignIn allowAppSetup />
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2 text-[11px] text-muted-foreground">
            <span>{streamIds ? streamState : "Choose a signal channel to get started"}</span>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-muted"
              aria-pressed={desktop}
              onClick={async () => {
                if (desktop) {
                  setDesktop(false);
                  return;
                }
                const error = await prepare({ toast: true, sound: false, desktop: true });
                if (error) setNotice(error);
                else {
                  setDesktop(true);
                  setNotice("");
                }
              }}
            >
              <BellIcon className="size-3" />
              {desktop ? "Desktop notifications on" : "Enable desktop notifications"}
            </button>
          </div>
          {notice ? (
            <p role="status" className="px-3 py-2 text-xs text-amber-400">
              {notice}
            </p>
          ) : null}
          <div className="flex min-h-0 flex-1 flex-col @min-[600px]:flex-row">
            <aside className="flex max-h-44 shrink-0 flex-col border-b border-border @min-[600px]:max-h-none @min-[600px]:w-48 @min-[600px]:border-r @min-[600px]:border-b-0">
              <p className="px-3 pt-2 text-[11px] leading-relaxed text-muted-foreground">
                Turn on a channel’s bell for signal alerts.
              </p>
              <label className="m-2 flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                <SearchIcon className="size-3 text-muted-foreground" />
                <input
                  aria-label="Search Telegram channels"
                  className="min-w-0 flex-1 bg-transparent text-xs outline-none"
                  placeholder="Find a channel"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <div className="min-h-0 flex-1 overflow-y-auto p-1">
                {channels.isPending ? (
                  <LoaderCircleIcon className="m-3 size-4 animate-spin" />
                ) : null}
                {channels.error ? (
                  <div role="alert" className="p-2 text-xs text-red-400">
                    {channels.error.message}
                    <Button size="xs" variant="ghost" onClick={() => void channels.refetch()}>
                      Retry
                    </Button>
                  </div>
                ) : null}
                {list.map((channel) => (
                  <div
                    key={channel.id}
                    className={cn(
                      "flex items-center gap-1 rounded-md",
                      selectedId === channel.id
                        ? "bg-blue-500/10 text-blue-300"
                        : "text-muted-foreground hover:bg-muted/40",
                    )}
                  >
                    <button
                      type="button"
                      aria-pressed={selectedId === channel.id}
                      className="min-w-0 flex-1 truncate px-2 py-2 text-left text-xs"
                      onClick={() => setActive(channel.id)}
                    >
                      {channel.title}
                    </button>
                    <button
                      type="button"
                      className="mr-1 grid size-7 shrink-0 place-items-center rounded hover:bg-muted"
                      aria-label={`${watched.includes(channel.id) ? "Mute" : "Notify me about"} ${channel.title}`}
                      aria-pressed={watched.includes(channel.id)}
                      onClick={() =>
                        setWatched((ids) =>
                          ids.includes(channel.id)
                            ? ids.filter((id) => id !== channel.id)
                            : [...ids, channel.id].slice(-100),
                        )
                      }
                    >
                      {watched.includes(channel.id) ? (
                        <BellIcon className="size-3 text-blue-400" />
                      ) : (
                        <BellOffIcon className="size-3 opacity-50" />
                      )}
                    </button>
                  </div>
                ))}
                {!channels.isPending && !channels.error && !list.length ? (
                  <p className="p-3 text-xs leading-relaxed text-muted-foreground">
                    {search
                      ? "No matching channels."
                      : "Join channels in Telegram, then refresh to see them here."}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="m-2 text-left text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() => void channels.refetch()}
              >
                Refresh channels
              </button>
            </aside>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {selected ? (
                <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                  <span className="truncate text-xs font-medium">{selected.title}</span>
                  {selected.username && /^[A-Za-z0-9_]+$/.test(selected.username) ? (
                    <a
                      href={`https://t.me/${selected.username}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Open channel in Telegram"
                      className="ml-auto text-muted-foreground"
                    >
                      <ExternalLinkIcon className="size-3.5" />
                    </a>
                  ) : null}
                </div>
              ) : null}
              <div
                ref={feed}
                onScroll={(event) => {
                  const node = event.currentTarget;
                  followLatest.current =
                    node.scrollHeight - node.scrollTop - node.clientHeight < 48;
                }}
                className="min-h-0 flex-1 overflow-y-auto p-4"
              >
                {messages.isFetching ? (
                  <p role="status" className="mb-3 text-xs text-muted-foreground">
                    Loading posts…
                  </p>
                ) : null}
                {messages.error ? (
                  <div role="alert" className="text-xs text-red-400">
                    {messages.error.message}
                    <Button size="xs" variant="ghost" onClick={() => void messages.refetch()}>
                      Retry
                    </Button>
                  </div>
                ) : null}
                <div className="mx-auto max-w-2xl space-y-4">
                  {messages.data?.map((message) => (
                    <article key={message.id} className="rounded-lg bg-muted/25 p-3.5">
                      <p className="whitespace-pre-wrap break-words text-xs leading-6">
                        {message.text || "Attachment"}
                      </p>
                      <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
                        <time dateTime={new Date(message.date * 1000).toISOString()}>
                          {new Date(message.date * 1000).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </time>
                        {message.media ? <span>View attachment in Telegram</span> : null}
                      </div>
                    </article>
                  ))}
                </div>
                {!messages.isFetching && !messages.error && selected && !messages.data?.length ? (
                  <p className="text-xs text-muted-foreground">No recent posts in this channel.</p>
                ) : null}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
