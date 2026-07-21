import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";
import { JarvisRuntimeProvider } from "./runtime.js";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<StrictMode><JarvisRuntimeProvider><App /></JarvisRuntimeProvider></StrictMode>);
