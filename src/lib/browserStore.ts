const DATABASE = "homework-evaluator";
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("data");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function readStored<T>(key: string): Promise<T | undefined> {
  const db = await open();
  try { return await new Promise((resolve, reject) => {
    const request = db.transaction("data").objectStore("data").get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  }); } finally { db.close(); }
}
export async function writeStored(key: string, value: unknown): Promise<void> {
  const db = await open();
  try { await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("data", "readwrite");
    transaction.objectStore("data").put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  }); } finally { db.close(); }
}
