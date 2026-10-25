import { useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { toastManager } from "../ui/toast";

type Preferences = { toast: boolean; sound: boolean; desktop: boolean };

/** User gestures unlock sound for both newly created and restored alerts. */
export function useAlertNotifications(hasSoundAlerts: boolean) {
  const sound = useRef<AudioContext | null>(null);
  const prepareSound = useCallback(async () => {
    if (!sound.current || sound.current.state === "closed") sound.current = new AudioContext();
    const context = sound.current;
    if (context.state !== "running") await context.resume();
    return context.state === "running";
  }, []);
  useEffect(() => {
    if (!hasSoundAlerts) return;
    const activate = () => {
      void prepareSound().catch(() => {});
    };
    document.addEventListener("pointerdown", activate, true);
    document.addEventListener("keydown", activate, true);
    return () => {
      document.removeEventListener("pointerdown", activate, true);
      document.removeEventListener("keydown", activate, true);
    };
  }, [hasSoundAlerts, prepareSound]);
  useEffect(
    () => () => {
      const context = sound.current;
      sound.current = null;
      if (context && context.state !== "closed") void context.close().catch(() => {});
    },
    [],
  );
  const prepare = useCallback(
    async (preferences: Preferences): Promise<string | null> => {
      if (preferences.desktop) {
        if (typeof Notification === "undefined")
          return "Desktop notifications aren't supported here. Choose a toast or sound instead.";
        const permission =
          Notification.permission === "default"
            ? await Notification.requestPermission()
            : Notification.permission;
        if (permission !== "granted")
          return "Allow desktop notifications, or turn that option off.";
      }
      if (preferences.sound) {
        try {
          if (!(await prepareSound())) return "Sound couldn't start. Turn sound off or try again.";
        } catch {
          return "Sound isn't available here. Turn sound off to save the alert.";
        }
      }
      return null;
    },
    [prepareSound],
  );
  const deliver = useCallback(
    (event: {
      id: string;
      title: string;
      body: string;
      description?: ReactNode;
      notifications?: Preferences;
    }) => {
      if (event.notifications?.toast !== false)
        toastManager.add({
          type: "info",
          title: event.title,
          description: event.description ?? event.body,
        });
      if (
        event.notifications?.desktop &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        try {
          const notification = new Notification(event.title, { body: event.body, tag: event.id });
          notification.addEventListener(
            "click",
            () => {
              window.focus();
              notification.close();
            },
            { once: true },
          );
        } catch {
          /* History and other delivery methods remain available. */
        }
      }
      if (event.notifications?.sound && sound.current?.state === "running") {
        const context = sound.current;
        for (const [offset, frequency] of [
          [0, 880],
          [0.15, 1174],
        ] as const) {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.frequency.value = frequency;
          gain.gain.setValueAtTime(0, context.currentTime + offset);
          gain.gain.linearRampToValueAtTime(0.12, context.currentTime + offset + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + offset + 0.2);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(context.currentTime + offset);
          oscillator.stop(context.currentTime + offset + 0.21);
          oscillator.addEventListener(
            "ended",
            () => {
              oscillator.disconnect();
              gain.disconnect();
            },
            { once: true },
          );
        }
      }
    },
    [],
  );
  return { prepare, deliver };
}
