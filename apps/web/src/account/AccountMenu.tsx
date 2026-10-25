import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { LogOutIcon, ChartNoAxesColumnIcon, UserRoundIcon, SettingsIcon } from "lucide-react";
import { Menu, MenuTrigger, MenuPopup, MenuItem } from "../components/ui/menu";
import { accountClient } from "./client";
import { useDesktopAccount } from "./desktop";

export function AccountMenu() {
  const { data } = accountClient.useSession();
  const desktop = useDesktopAccount();
  const user = desktop.user ?? data?.user;
  const navigate = useNavigate();
  const [error, setError] = useState("");
  return (
    <Menu>
      <MenuTrigger
        aria-label={user ? `Signed in as ${user.name || user.email}` : "Sign in"}
        className="flex w-full min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-sidebar-accent"
      >
        <span className="relative flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
          {user?.image ? (
            <img
              src={user.image}
              alt=""
              referrerPolicy="no-referrer"
              className="size-7 rounded-full object-cover"
            />
          ) : user ? (
            user.name.slice(0, 1).toUpperCase()
          ) : (
            <UserRoundIcon className="size-4" />
          )}
          {user && (
            <span className="absolute -right-px -bottom-px size-2 rounded-full border border-sidebar bg-emerald-400" />
          )}
        </span>
        <span className="truncate text-sm">{user?.name || "Sign in"}</span>
      </MenuTrigger>
      <MenuPopup side="top" align="start" className="w-(--anchor-width) max-w-(--available-width)">
        <div className="px-3 py-2">
          <p className="truncate text-sm font-medium">{user?.name || "Automorphic account"}</p>
          <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          {error && (
            <p role="alert" className="mt-2 text-xs text-red-400">
              {error}
            </p>
          )}
        </div>
        <MenuItem onClick={() => void navigate({ to: "/usage" })}>
          <ChartNoAxesColumnIcon /> Usage
        </MenuItem>
        <MenuItem onClick={() => void navigate({ to: "/settings" })}>
          <SettingsIcon /> Settings
        </MenuItem>
        <MenuItem
          onClick={async () => {
            setError("");
            try {
              await window.signOut?.();
              window.dispatchEvent(new Event("automorphic-account-changed"));
              const result = await accountClient.signOut();
              if (result.error) throw new Error("Could not sign out. Please try again.");
            } catch {
              setError("Could not sign out. Please try again.");
            }
          }}
        >
          <LogOutIcon /> Sign out
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}
