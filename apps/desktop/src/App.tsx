import { BrowserRouter, Route, Routes } from "react-router-dom";
import { CanvasWorkspaceProvider } from "./features/canvas/CanvasWorkspaceContext";
import { Shell } from "./layout/Shell";

export function App() {
  return (
    <BrowserRouter>
      <CanvasWorkspaceProvider>
        <Routes>
          <Route element={<Shell />} path="*" />
        </Routes>
      </CanvasWorkspaceProvider>
    </BrowserRouter>
  );
}
