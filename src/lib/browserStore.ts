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
async function write(key: string, value: unknown): Promise<void> {
  const db = await open();
  try { await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("data", "readwrite");
    transaction.objectStore("data").put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  }); } finally { db.close(); }
}

let resetting = false;
const pending = new Set<Promise<void>>();
export function writeStored(key: string, value: unknown): Promise<void> {
  if (resetting) return Promise.resolve();
  const operation = write(key, value);
  pending.add(operation);
  void operation.then(() => pending.delete(operation), () => pending.delete(operation));
  return operation;
}

export async function resetStored(): Promise<void> {
  if (resetting) throw new Error("초기화가 진행 중입니다.");
  resetting = true;
  try {
    await Promise.allSettled([...pending]);
    const db = await open();
    try { await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("data", "readwrite");
      transaction.objectStore("data").clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    }); } finally { db.close(); }
  } catch (error) { resetting = false; throw error; }
}
