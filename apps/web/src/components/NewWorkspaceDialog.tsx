import { tradingFetch } from "./trading/tradingTransport";
import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { ThreadId } from "@t3tools/contracts";
import { usePrimaryEnvironmentId } from "../state/environments";
import { buildThreadRouteParams } from "../threadRoutes";
import { Button } from "./ui/button";
import { initializeTradingWorkspacePanel } from "./trading/tradingWorkspacePanel";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";

export function NewWorkspaceDialog({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdThread, setCreatedThread] = useState<ThreadId | null>(null);
  const submitting = useRef(false);
  const environmentId = usePrimaryEnvironmentId();
  const navigate = useNavigate();
  const create = async () => {
    if (submitting.current || !title.trim() || !environmentId) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      let threadId = createdThread;
      if (!threadId) {
        const response = await tradingFetch("/api/trading/workspaces", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: title.trim() }),
        });
        if (!response.ok) {
          const failure: unknown = await response.json().catch(() => null);
          const message =
            failure &&
            typeof failure === "object" &&
            "error" in failure &&
            typeof failure.error === "string"
              ? failure.error.slice(0, 240)
              : "Could not create the workspace. Please try again.";
          throw Error(message);
        }
        const result: unknown = await response.json();
        if (
          !result ||
          typeof result !== "object" ||
          !("threadId" in result) ||
          typeof result.threadId !== "string" ||
          !result.threadId
        )
          throw Error("The server returned an invalid workspace.");
        threadId = result.threadId as ThreadId;
        setCreatedThread(threadId);
      }
      initializeTradingWorkspacePanel(scopeThreadRef(environmentId, threadId));
      await navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(scopeThreadRef(environmentId, threadId)),
      });
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not create the workspace.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogPopup showCloseButton={!pending} className="max-w-sm">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <DialogHeader>
            <DialogTitle>New workspace</DialogTitle>
            <DialogDescription>A space for your ideas, charts and files.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-6 pb-6">
            <label htmlFor="new-workspace-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="new-workspace-name"
              autoFocus
              maxLength={80}
              value={title}
              placeholder="My trading ideas"
              disabled={pending || createdThread !== null}
              onChange={(event) => setTitle(event.target.value)}
            />
            {error ? (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !title.trim() || !environmentId}>
              {pending ? "Creating…" : createdThread ? "Open workspace" : "Create workspace"}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
