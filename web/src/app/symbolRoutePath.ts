import { parseSymbolId } from "@/features/dashboard/symbolId";

export function canonicalSymbolRoutePath(value: string | undefined): string | null {
  const symbolId = parseSymbolId(value);

  if (!symbolId || value === symbolId) {
    return null;
  }

  return `/symbols/${symbolId}`;
}
