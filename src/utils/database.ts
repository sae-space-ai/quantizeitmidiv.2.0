/**
 * QUANTIZE.IT - Local Database Layer (IndexedDB)
 * 
 * Stores projects, configurations, processing history, and MIDI file references.
 * Files are stored as Blobs (not base64 strings) for efficiency.
 * 
 * Schema version: 1
 * Object stores:
 *   - projects: Project metadata and references
 *   - files: MIDI file blobs (input/output)
 *   - configurations: Saved quantization presets
 *   - history: Processing history entries
 *   - ai_suggestions: AI suggestions log
 * 
 * No user data is exposed publicly. All operations are local.
 */

const DB_NAME = 'quantize-it-db';
const DB_VERSION = 1;

// ============ TYPES ============

export interface DBProject {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  inputFileId: string;
  outputFileId?: string;
  configId: string;
  status: 'draft' | 'processed' | 'archived';
  notes?: string;
  tags?: string[];
}

export interface DBFile {
  id: string;
  projectId: string;
  type: 'input' | 'output';
  name: string;
  size: number;
  mimeType: string;
  blob: Blob;
  createdAt: number;
  checksum?: string;
}

export interface DBConfiguration {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  params: {
    grid: string;
    strength: number;
    swing: number;
    quantizeStarts: boolean;
    quantizeEnds: boolean;
    preserveVelocity: boolean;
    humanizeTicks: number;
    outputTempo: number;
  };
  isDefault: boolean;
}

export interface DBHistoryEntry {
  id: string;
  projectId: string;
  timestamp: number;
  action: 'load' | 'quantize' | 'save' | 'export' | 'ai_suggest' | 'ai_accept' | 'ai_reject';
  details: Record<string, any>;
  durationMs?: number;
}

export interface DBAiSuggestion {
  id: string;
  projectId: string;
  timestamp: number;
  provider: string;
  trackIndex: number;
  type: 'rhythm_error' | 'note_proximity' | 'articulation' | 'bar_suggestion';
  description: string;
  explanation: string;
  beforeData: any;
  afterData: any;
  status: 'pending' | 'accepted' | 'rejected';
  appliedAt?: number;
}

// ============ DATABASE CONNECTION ============

let dbInstance: IDBDatabase | null = null;

export function openDatabase(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Projects store
      if (!db.objectStoreNames.contains('projects')) {
        const projectsStore = db.createObjectStore('projects', { keyPath: 'id' });
        projectsStore.createIndex('createdAt', 'createdAt', { unique: false });
        projectsStore.createIndex('status', 'status', { unique: false });
      }

      // Files store (blobs)
      if (!db.objectStoreNames.contains('files')) {
        const filesStore = db.createObjectStore('files', { keyPath: 'id' });
        filesStore.createIndex('projectId', 'projectId', { unique: false });
        filesStore.createIndex('type', 'type', { unique: false });
      }

      // Configurations store
      if (!db.objectStoreNames.contains('configurations')) {
        const configsStore = db.createObjectStore('configurations', { keyPath: 'id' });
        configsStore.createIndex('isDefault', 'isDefault', { unique: false });
      }

      // History store
      if (!db.objectStoreNames.contains('history')) {
        const historyStore = db.createObjectStore('history', { keyPath: 'id' });
        historyStore.createIndex('projectId', 'projectId', { unique: false });
        historyStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // AI suggestions store
      if (!db.objectStoreNames.contains('ai_suggestions')) {
        const suggestionsStore = db.createObjectStore('ai_suggestions', { keyPath: 'id' });
        suggestionsStore.createIndex('projectId', 'projectId', { unique: false });
        suggestionsStore.createIndex('status', 'status', { unique: false });
      }
    };
  });
}

// ============ HELPERS ============

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

async function transaction<T>(
  storeNames: string | string[],
  mode: IDBTransactionMode,
  callback: (stores: Record<string, IDBObjectStore>) => Promise<T> | T
): Promise<T> {
  const db = await openDatabase();
  const names = Array.isArray(storeNames) ? storeNames : [storeNames];
  const tx = db.transaction(names, mode);
  
  const stores: Record<string, IDBObjectStore> = {};
  for (const name of names) {
    stores[name] = tx.objectStore(name);
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(undefined as any);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    
    Promise.resolve(callback(stores)).then(resolve).catch(reject);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ============ PROJECTS ============

export async function createProject(
  name: string,
  inputFileId: string,
  configId: string
): Promise<DBProject> {
  const db = await openDatabase();
  const project: DBProject = {
    id: generateId(),
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    inputFileId,
    configId,
    status: 'draft',
  };

  const tx = db.transaction('projects', 'readwrite');
  const store = tx.objectStore('projects');
  await requestToPromise(store.add(project));
  return project;
}

export async function getProject(id: string): Promise<DBProject | undefined> {
  const db = await openDatabase();
  const tx = db.transaction('projects', 'readonly');
  return requestToPromise(tx.objectStore('projects').get(id));
}

export async function getAllProjects(): Promise<DBProject[]> {
  const db = await openDatabase();
  const tx = db.transaction('projects', 'readonly');
  const all = await requestToPromise(tx.objectStore('projects').getAll());
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function updateProject(project: DBProject): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction('projects', 'readwrite');
  await requestToPromise(tx.objectStore('projects').put({
    ...project,
    updatedAt: Date.now(),
  }));
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(['projects', 'files', 'history', 'ai_suggestions'], 'readwrite');
  
  // Delete related files
  const filesStore = tx.objectStore('files');
  const filesIndex = filesStore.index('projectId');
  const files = await requestToPromise(filesIndex.getAll(id));
  for (const file of files) {
    filesStore.delete(file.id);
  }

  // Delete related history
  const historyStore = tx.objectStore('history');
  const historyIndex = historyStore.index('projectId');
  const historyEntries = await requestToPromise(historyIndex.getAll(id));
  for (const entry of historyEntries) {
    historyStore.delete(entry.id);
  }

  // Delete related AI suggestions
  const suggestionsStore = tx.objectStore('ai_suggestions');
  const suggestionsIndex = suggestionsStore.index('projectId');
  const suggestions = await requestToPromise(suggestionsIndex.getAll(id));
  for (const suggestion of suggestions) {
    suggestionsStore.delete(suggestion.id);
  }

  // Delete project
  await requestToPromise(tx.objectStore('projects').delete(id));
}

// ============ FILES ============

export async function saveFile(
  projectId: string,
  type: 'input' | 'output',
  name: string,
  blob: Blob
): Promise<DBFile> {
  const db = await openDatabase();
  const file: DBFile = {
    id: generateId(),
    projectId,
    type,
    name,
    size: blob.size,
    mimeType: blob.type || 'audio/midi',
    blob,
    createdAt: Date.now(),
  };

  const tx = db.transaction('files', 'readwrite');
  await requestToPromise(tx.objectStore('files').add(file));
  return file;
}

export async function getFile(id: string): Promise<DBFile | undefined> {
  const db = await openDatabase();
  const tx = db.transaction('files', 'readonly');
  return requestToPromise(tx.objectStore('files').get(id));
}

export async function getFilesByProject(projectId: string): Promise<DBFile[]> {
  const db = await openDatabase();
  const tx = db.transaction('files', 'readonly');
  const index = tx.objectStore('files').index('projectId');
  return requestToPromise(index.getAll(projectId));
}

// ============ CONFIGURATIONS ============

export async function saveConfiguration(
  name: string,
  params: DBConfiguration['params'],
  isDefault = false
): Promise<DBConfiguration> {
  const db = await openDatabase();
  const config: DBConfiguration = {
    id: generateId(),
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    params,
    isDefault,
  };

  const tx = db.transaction('configurations', 'readwrite');
  await requestToPromise(tx.objectStore('configurations').add(config));
  return config;
}

export async function getAllConfigurations(): Promise<DBConfiguration[]> {
  const db = await openDatabase();
  const tx = db.transaction('configurations', 'readonly');
  return requestToPromise(tx.objectStore('configurations').getAll());
}

export async function getDefaultConfiguration(): Promise<DBConfiguration | undefined> {
  const all = await getAllConfigurations();
  return all.find(c => c.isDefault) || all[0];
}

// ============ HISTORY ============

export async function addHistoryEntry(
  projectId: string,
  action: DBHistoryEntry['action'],
  details: Record<string, any>,
  durationMs?: number
): Promise<DBHistoryEntry> {
  const db = await openDatabase();
  const entry: DBHistoryEntry = {
    id: generateId(),
    projectId,
    timestamp: Date.now(),
    action,
    details,
    durationMs,
  };

  const tx = db.transaction('history', 'readwrite');
  await requestToPromise(tx.objectStore('history').add(entry));
  return entry;
}

export async function getHistoryByProject(projectId: string): Promise<DBHistoryEntry[]> {
  const db = await openDatabase();
  const tx = db.transaction('history', 'readonly');
  const index = tx.objectStore('history').index('projectId');
  const all = await requestToPromise(index.getAll(projectId));
  return all.sort((a, b) => b.timestamp - a.timestamp);
}

// ============ AI SUGGESTIONS ============

export async function saveAiSuggestion(
  suggestion: Omit<DBAiSuggestion, 'id'>
): Promise<DBAiSuggestion> {
  const db = await openDatabase();
  const full: DBAiSuggestion = {
    ...suggestion,
    id: generateId(),
  };

  const tx = db.transaction('ai_suggestions', 'readwrite');
  await requestToPromise(tx.objectStore('ai_suggestions').add(full));
  return full;
}

export async function updateAiSuggestionStatus(
  id: string,
  status: 'accepted' | 'rejected'
): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction('ai_suggestions', 'readwrite');
  const suggestion = await requestToPromise(tx.objectStore('ai_suggestions').get(id));
  if (suggestion) {
    suggestion.status = status;
    if (status === 'accepted') {
      suggestion.appliedAt = Date.now();
    }
    await requestToPromise(tx.objectStore('ai_suggestions').put(suggestion));
  }
}

export async function getAiSuggestionsByProject(projectId: string): Promise<DBAiSuggestion[]> {
  const db = await openDatabase();
  const tx = db.transaction('ai_suggestions', 'readonly');
  const index = tx.objectStore('ai_suggestions').index('projectId');
  const all = await requestToPromise(index.getAll(projectId));
  return all.sort((a, b) => b.timestamp - a.timestamp);
}

// ============ STORAGE ESTIMATION ============

export async function estimateStorage(): Promise<{ usage: number; quota: number } | null> {
  if (navigator.storage && navigator.storage.estimate) {
    const estimate = await navigator.storage.estimate();
    return {
      usage: estimate.usage || 0,
      quota: estimate.quota || 0,
    };
  }
  return null;
}

// ============ INITIALIZATION ============

export async function initializeDatabase(): Promise<void> {
  await openDatabase();
  
  // Create default configuration if none exists
  const configs = await getAllConfigurations();
  if (configs.length === 0) {
    await saveConfiguration(
      'Default (1/16, 85%)',
      {
        grid: '1/16',
        strength: 85,
        swing: 0,
        quantizeStarts: true,
        quantizeEnds: false,
        preserveVelocity: true,
        humanizeTicks: 0,
        outputTempo: 56,
      },
      true
    );
  }
}
