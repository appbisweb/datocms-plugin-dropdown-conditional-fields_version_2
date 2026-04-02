import { createRoot } from "react-dom/client";
import { StrictMode } from "react";

let root: ReturnType<typeof createRoot> | null = null;

export function render(component: React.ReactNode) {
  const container = document.getElementById("root");
  if (!container) throw new Error("Missing #root element");

  if (!root) {
    root = createRoot(container);
  }

  root.render(<StrictMode>{component}</StrictMode>);
}
