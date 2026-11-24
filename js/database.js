// IndexedDB keeps recipe text and optional photos on this device.
const RecipeDB = (() => {
  const DB_NAME = "recipe-book-db";
  const STORE = "recipes";
  let database;

  function open() {
    if (database) return Promise.resolve(database);
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("updatedAt", "updatedAt");
        }
      };
      request.onsuccess = () => { database = request.result; resolve(database); };
      request.onerror = () => reject(request.error);
    });
  }

  async function run(mode, operation) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let request;
      try { request = operation(store); }
      catch (error) { reject(error); return; }
      tx.oncomplete = () => resolve(request ? request.result : true);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  return {
    getAll: () => run("readonly", store => store.getAll()),
    get: id => run("readonly", store => store.get(id)),
    save: recipe => run("readwrite", store => store.put(recipe)),
    remove: id => run("readwrite", store => store.delete(id))
  };
})();
