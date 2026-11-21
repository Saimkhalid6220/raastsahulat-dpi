import type { syntheticDocument } from "./syntheticScan";

export interface OfflineClaim {
  id: string;
  owner: string;
  family: string;
  data: { citizenId: string; delegationToken: string; requestedAmountPKR: number; extractedDocData: ReturnType<typeof syntheticDocument>; idempotencyKey: string };
}
const storeName = "claims";

async function openOutbox() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const opening = indexedDB.open("raastsahulat-offline", 1);
    opening.onupgradeneeded = () => { opening.result.createObjectStore(storeName, { keyPath: "id" }); };
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => reject(opening.error);
  });
}

async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openOutbox();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = database.transaction(storeName, mode);
      const operation = run(tx.objectStore(storeName));
      tx.oncomplete = () => resolve(operation.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("Offline operation aborted"));
    });
  } finally {
    database.close();
  }
}

export async function queuedClaims(owner: string) {
  const rows = await transaction<OfflineClaim[]>("readonly", (store) => store.getAll());
  return rows.filter((row) => row.owner === owner);
}

export function queueClaim(claim: OfflineClaim) {
  return transaction("readwrite", (store) => store.put(claim));
}

export function discardClaim(id: string) {
  return transaction("readwrite", (store) => store.delete(id));
}
