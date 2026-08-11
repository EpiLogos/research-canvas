import { BrowserRouter, Route, Routes } from "react-router-dom";
import { CanvasWorkspaceProvider } from "./features/canvas/CanvasWorkspaceContext";
import { ProjectTabProvider } from "./features/projects/ProjectTabContext";
import { Shell } from "./layout/Shell";

export function App() {
  return (
    <BrowserRouter>
      <CanvasWorkspaceProvider>
        <ProjectTabProvider>
          <Routes>
            <Route element={<Shell />} path="*" />
          </Routes>
        </ProjectTabProvider>
      </CanvasWorkspaceProvider>
    </BrowserRouter>
  );
}
