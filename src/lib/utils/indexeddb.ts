export function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("RavenOnePersistence", 1);
        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains("preservedFiles")) {
                db.createObjectStore("preservedFiles", { keyPath: "id" });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function saveFileToDB(file: any): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("preservedFiles", "readwrite");
        const store = transaction.objectStore("preservedFiles");
        const request = store.put(file);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

export async function getAllFilesFromDB(): Promise<any[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("preservedFiles", "readonly");
        const store = transaction.objectStore("preservedFiles");
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function deleteFileFromDB(id: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("preservedFiles", "readwrite");
        const store = transaction.objectStore("preservedFiles");
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

export async function clearAllFilesFromDB(): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("preservedFiles", "readwrite");
        const store = transaction.objectStore("preservedFiles");
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}
