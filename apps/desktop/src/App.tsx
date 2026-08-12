import { BrowserRouter, Route, Routes } from "react-router-dom";
import { CanvasWorkspaceProvider } from "./features/canvas/CanvasWorkspaceContext";
import { Shell } from "./layout/Shell";

export function App() {
  return (
    <BrowserRouter>
      <CanvasWorkspaceProvider>
        <Routes>
          <Route
            path="/project/:projectId/surface/:surfaceId/constellation/:constellationId/:detailId?"
            element={<Shell />}
          />
          <Route path="*" element={<Shell />} />
        </Routes>
      </CanvasWorkspaceProvider>
    </BrowserRouter>
  );
}
