export function getValueByPath(
  path: string,
  data: Record<string, unknown>,
): unknown {
  if (!data) {
    return data;
  }
  const parts = path.split('.');
  const next = parts.shift();
  const restPath = parts.join('.');

  return next
    ? getValueByPath(restPath, data[next] as Record<string, unknown>)
    : data;
}
