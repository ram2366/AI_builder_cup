import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import * as maplibregl from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import App from "./App";
import "./index.css";

// Vite bundles MapLibre's main module, so its import.meta.url no longer points beside the
// separately published worker. Importing the worker as an asset gives production builds a
// real, fingerprinted URL while leaving development on the same code path.
maplibregl.setWorkerUrl(maplibreWorkerUrl);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
