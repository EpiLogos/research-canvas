import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const repositoryRoot = realpathSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
);

const applications = [
  {
    directory: "apps/desktop",
    importer: "src/main.tsx",
    workspacePackages: [
      "canvas",
      "desktop-api",
      "exporter",
      "node-document",
      "schema",
      "search",
      "viewers"
    ]
  },
  {
    directory: "apps/public-viewer",
    importer: "src/main.tsx",
    workspacePackages: ["canvas", "desktop-api", "exporter", "schema", "viewers"]
  }
];

for (const application of applications) {
  const applicationRoot = path.join(repositoryRoot, application.directory);
  const server = await createServer({
    appType: "custom",
    configFile: path.join(applicationRoot, "vite.config.ts"),
    logLevel: "silent",
    root: applicationRoot,
    server: { middlewareMode: true }
  });

  try {
    for (const packageName of application.workspacePackages) {
      const specifier = `@research-canvas/${packageName}`;
      const result = await server.pluginContainer.resolveId(
        specifier,
        path.join(applicationRoot, application.importer)
      );
      if (!result) {
        throw new Error(`${application.directory}: Vite could not resolve ${specifier}`);
      }

      const resolvedPath = realpathSync(result.id.split("?")[0]);
      const relativePath = path.relative(repositoryRoot, resolvedPath);
      if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
        throw new Error(
          `${application.directory}: ${specifier} escaped the active repository: ${resolvedPath}`
        );
      }

      const expectedPrefix = path.join("packages", packageName, "src");
      if (relativePath !== expectedPrefix && !relativePath.startsWith(`${expectedPrefix}${path.sep}`)) {
        throw new Error(
          `${application.directory}: ${specifier} resolved to ${relativePath}, expected ${expectedPrefix}`
        );
      }

      process.stdout.write(`${application.directory}: ${specifier} -> ${relativePath}\n`);
    }
  } finally {
    await server.close();
  }
}
