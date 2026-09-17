import { showBootError } from "./lib/bootError";

// The optional trial asset is served only by Vite, never bundled for release.
if (import.meta.env.DEV) {
  const font = new FontFace("Aeonik", 'url("/__local-fonts/aeoniktrial-regular.otf")', {
    weight: "400",
    display: "swap",
  });
  void font
    .load()
    .then((loaded) => document.fonts.add(loaded))
    .catch(() => {
      /* Geist remains the fallback. */
    });
}

// Match the development-only element picker used on the marketing site.
if (import.meta.env.DEV && !document.getElementById("automorphic-react-grab")) {
  const script = document.createElement("script");
  script.id = "automorphic-react-grab";
  script.src = "https://unpkg.com/react-grab@0.2.0/dist/index.global.js";
  script.crossOrigin = "anonymous";
  script.async = true;
  document.head.append(script);
}

// Bundled dev can move UI code into shared chunks. Load it only after this
// entry runs the React refresh preamble, and catch failures before React mounts.
void import("./main").then(({ startup }) => startup).catch(showBootError);
