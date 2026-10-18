export const WORKSPACE_MIN_W = 440;
export const WORKSPACE_DEFAULT_MIN_W = 520;
export const WORKSPACE_DEFAULT_MAX_W = 760;

export function defaultWorkspaceWidth(viewportWidth: number): number {
  return Math.round(Math.min(WORKSPACE_DEFAULT_MAX_W, Math.max(WORKSPACE_DEFAULT_MIN_W, viewportWidth * 0.42)));
}

export function clampWorkspaceWidth(value: number, viewportWidth: number): number {
  const maximum = Math.max(WORKSPACE_MIN_W, viewportWidth * 0.6);
  return Math.round(Math.min(maximum, Math.max(WORKSPACE_MIN_W, value)));
}
