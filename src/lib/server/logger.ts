type LogValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Record<string, unknown>
  | Array<unknown>;

export function logEvent(
  event: string,
  fields: Record<string, LogValue> = {},
) {
  console.info(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      service: "arcproof",
      event,
      ...fields,
    }),
  );
}
