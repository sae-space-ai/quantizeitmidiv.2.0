/**
 * QUANTIZE.IT - Project Manager Panel
 * 
 * Manages projects in IndexedDB.
 * Save/load/delete projects with their files and configurations.
 */

import { useState, useEffect } from 'react';
import { Folder, Save, Trash2, Download } from 'lucide-react';
import {
  getAllProjects,
  createProject,
  deleteProject,
  saveFile,
  type DBProject,
} from '../utils/database';

interface ProjectManagerProps {
  currentProjectId: string | null;
  fileName: string;
  inputFileBuffer: ArrayBuffer | null;
  outputFileBuffer: ArrayBuffer | null;
  configId: string;
  onLoadProject: (projectId: string) => Promise<void>;
  onProjectSaved: (projectId: string) => void;
}

export function ProjectManager({
  currentProjectId,
  fileName,
  inputFileBuffer,
  outputFileBuffer,
  configId,
  onLoadProject,
  onProjectSaved,
}: ProjectManagerProps) {
  const [projects, setProjects] = useState<DBProject[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const all = await getAllProjects();
      setProjects(all);
    } catch (err) {
      setError('Failed to load projects');
    }
  };

  const handleSave = async () => {
    if (!inputFileBuffer) {
      setError('No file loaded');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      let projectId = currentProjectId;

      if (!projectId) {
        // Create new project
        const project = await createProject(fileName || 'Untitled', '', configId);
        projectId = project.id;

        // Save input file
        const inputBlob = new Blob([inputFileBuffer], { type: 'audio/midi' });
        await saveFile(projectId, 'input', fileName || 'input.mid', inputBlob);
      }

      // Save output file if available
      if (outputFileBuffer && projectId) {
        const outputBlob = new Blob([outputFileBuffer], { type: 'audio/midi' });
        await saveFile(projectId, 'output', `quantized_${fileName}`, outputBlob);
      }

      onProjectSaved(projectId!);
      await loadProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save project');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (projectId: string) => {
    if (!confirm('Delete this project? This cannot be undone.')) return;

    try {
      await deleteProject(projectId);
      await loadProjects();
    } catch (err) {
      setError('Failed to delete project');
    }
  };

  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Folder className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-medium text-white">Projects</h3>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving || !inputFileBuffer}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
            isSaving || !inputFileBuffer
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : 'bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300'
          }`}
        >
          <Save className="w-3.5 h-3.5" />
          {isSaving ? 'Saving...' : currentProjectId ? 'Update' : 'Save Project'}
        </button>
      </div>

      {error && (
        <div className="mb-3 p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-300">
          {error}
        </div>
      )}

      {projects.length === 0 ? (
        <div className="text-center py-4 text-gray-500 text-xs">
          No saved projects yet. Save your current work to create a project.
        </div>
      ) : (
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {projects.map((project) => (
            <div
              key={project.id}
              className={`flex items-center justify-between p-2 rounded-lg text-sm ${
                currentProjectId === project.id
                  ? 'bg-cyan-500/20 border border-cyan-500/40'
                  : 'bg-gray-700/30 hover:bg-gray-700/50'
              }`}
            >
              <button
                onClick={() => onLoadProject(project.id)}
                className="flex-1 text-left truncate"
              >
                <div className="text-gray-200 truncate">{project.name}</div>
                <div className="text-xs text-gray-500">
                  {new Date(project.updatedAt).toLocaleDateString()}
                </div>
              </button>
              <button
                onClick={() => handleDelete(project.id)}
                className="p-1 hover:bg-red-500/20 rounded ml-2"
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-gray-700/30 text-xs text-gray-500">
        Projects are stored locally in your browser using IndexedDB. 
        Files are stored as blobs, not in database tables.
      </div>
    </div>
  );
}
