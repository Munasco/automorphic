import { createFileRoute, redirect } from "@tanstack/react-router";
// Keep old bookmarks navigable after removing the pull-request workspace.
export const Route = createFileRoute("/_chat/pull-requests")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
