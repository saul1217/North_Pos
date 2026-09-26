// Envío por tandas a /api/sales/sync. El backend acepta como máximo 100 ventas
// por petición (@ArrayMaxSize(100)) y Express limita el cuerpo JSON a 100 kB por
// defecto; una sola petición con todo el historial devolvía 400/413 y ninguna
// actualización de estado llegaba al servidor.

export const MAX_SALES_PER_REQUEST = 100;
// Margen bajo el límite de 100 kB del body parser del backend.
export const MAX_REQUEST_BYTES = 90_000;

export type ChunkPostResult = {
  okHttp: boolean;
  data: { applied?: string[]; skipped?: string[]; failed?: { id: string; reason: string }[] } | null;
  error?: string;
};

export type MergedChunkResult = {
  applied: string[];
  skipped: string[];
  failed: { id: string; reason: string }[];
  /** Errores de tandas completas (HTTP/red), en orden. */
  errors: string[];
  chunks: number;
};

/** Parte en tandas de ≤ maxCount elementos y ≤ maxBytes de JSON (una venta enorme va sola). */
export function chunkForSync<T>(
  items: T[],
  maxCount = MAX_SALES_PER_REQUEST,
  maxBytes = MAX_REQUEST_BYTES,
): T[][] {
  const chunks: T[][] = [];
  let current: T[] = [];
  let bytes = 0;
  for (const item of items) {
    const size = JSON.stringify(item)?.length ?? 0;
    if (current.length > 0 && (current.length >= maxCount || bytes + size > maxBytes)) {
      chunks.push(current);
      current = [];
      bytes = 0;
    }
    current.push(item);
    bytes += size + 1;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/** Envía cada tanda por separado y junta los resultados: una tanda fallida no frena las demás. */
export async function postInChunks<T>(
  items: T[],
  post: (chunk: T[]) => Promise<ChunkPostResult>,
  maxCount = MAX_SALES_PER_REQUEST,
  maxBytes = MAX_REQUEST_BYTES,
): Promise<MergedChunkResult> {
  const merged: MergedChunkResult = { applied: [], skipped: [], failed: [], errors: [], chunks: 0 };
  for (const chunk of chunkForSync(items, maxCount, maxBytes)) {
    merged.chunks += 1;
    try {
      const result = await post(chunk);
      if (!result.okHttp) {
        merged.errors.push(result.error || "Error de sincronización");
        continue;
      }
      merged.applied.push(...(result.data?.applied ?? []));
      merged.skipped.push(...(result.data?.skipped ?? []));
      merged.failed.push(...(result.data?.failed ?? []));
    } catch (error) {
      merged.errors.push((error as Error)?.message || "Error de red");
    }
  }
  return merged;
}
