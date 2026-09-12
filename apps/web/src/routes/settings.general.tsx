import { AccountSettings } from "../account/AccountGate";
import { createFileRoute } from "@tanstack/react-router";

import { GeneralSettingsPanel } from "../components/settings/SettingsPanels";

function SettingsGeneralRoute() {
  return (
    <div className="space-y-6">
      <AccountSettings />
      <GeneralSettingsPanel />
    </div>
  );
}

export const Route = createFileRoute("/settings/general")({
  component: SettingsGeneralRoute,
});
