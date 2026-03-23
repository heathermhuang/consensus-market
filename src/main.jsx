import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { loadRuntimeConfig } from "./runtime-config";
import "./styles.css";

const root = ReactDOM.createRoot(document.getElementById("root"));

async function bootstrap() {
  const runtimeConfig = await loadRuntimeConfig();

  root.render(
    <React.StrictMode>
      <App runtimeConfig={runtimeConfig} />
    </React.StrictMode>
  );
}

void bootstrap();
