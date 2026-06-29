import React from "react";
import ReactDOM from "react-dom/client";
import { StickFightGame } from "./game/StickFightGame";
import "./styles.css";

const rootElement = document.getElementById("root");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <StickFightGame />
    </React.StrictMode>
  );
}
