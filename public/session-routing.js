export function findPortForSession(instances, sessionFile, fallbackPort) {
  const match = Array.isArray(instances)
    ? instances.find((instance) => instance?.sessionFile === sessionFile)
    : null;
  return typeof match?.port === "number" ? match.port : fallbackPort;
}

export function getWorkspacePathForPort(instances, port) {
  const match = Array.isArray(instances)
    ? instances.find((instance) => instance?.port === port)
    : null;
  return match?.cwd || "";
}
