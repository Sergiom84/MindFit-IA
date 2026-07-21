import React from 'react';
import { X, Plus, Edit3, Trash2, Save, RotateCcw, Play, Music } from 'lucide-react';

// Playlist management panel for local files. Presentational; visibility guarded by parent.
const PlaylistManager = ({
  onClose,
  creatingPlaylist,
  newPlaylistName,
  setNewPlaylistName,
  tempTracks,
  clearAllTempTracks,
  removeFromTemp,
  cancelCreatingPlaylist,
  confirmCreatePlaylist,
  startCreatingPlaylist,
  playlists,
  editingPlaylist,
  setEditingPlaylist,
  updatePlaylistName,
  deletePlaylist,
  selectAndPlayPlaylist
}) => (
  <div className="border-t border-gray-700/50 pt-4">
    <div className="flex items-center justify-between mb-3">
      <span className="text-white text-sm font-medium">Gestión de Playlists</span>
      <button
        onClick={onClose}
        className="p-1.5 hover:bg-gray-700/50 rounded-lg transition-colors"
        title="Cerrar"
      >
        <X className="w-4 h-4 text-gray-400" />
      </button>
    </div>

    {/* Creating New Playlist */}
    {creatingPlaylist ? (
      <div className="bg-blue-600/10 border border-blue-600/30 rounded-lg p-4 space-y-3">
        <div className="text-sm text-blue-400 font-medium">📝 Crear Nueva Playlist</div>

        {/* Nombre de la playlist */}
        <div>
          <input
            type="text"
            value={newPlaylistName}
            onChange={(e) => setNewPlaylistName(e.target.value)}
            placeholder="Nombre de la playlist"
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
          />
        </div>

        {/* Botones para gestión de archivos */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => document.getElementById('temp-file-input')?.click()}
            className="flex items-center space-x-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm">Añadir Canciones</span>
          </button>

          <div className="flex items-center space-x-2">
            <span className="text-xs text-gray-400">
              {tempTracks.length} {tempTracks.length === 1 ? 'canción' : 'canciones'}
            </span>

            {tempTracks.length > 0 && (
              <button
                onClick={clearAllTempTracks}
                className="flex items-center space-x-1 px-2 py-1 bg-red-600/80 hover:bg-red-600 rounded text-xs transition-colors"
                title="Eliminar todas las canciones"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Limpiar</span>
              </button>
            )}
          </div>
        </div>

        {/* Lista temporal de canciones */}
        {tempTracks.length > 0 && (
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {tempTracks.map((track, index) => (
              <div key={track.id} className="flex items-center space-x-2 p-2 bg-gray-800/50 rounded text-xs">
                <span className="flex-1 text-gray-200 truncate">
                  {index + 1}. {track.name}
                </span>
                <button
                  onClick={() => removeFromTemp(track.id)}
                  className="p-0.5 hover:bg-red-600/30 rounded transition-colors"
                  title="Eliminar"
                >
                  <X className="w-3 h-3 text-red-400" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Botones de acción */}
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={cancelCreatingPlaylist}
            className="px-3 py-1.5 text-gray-400 hover:text-white transition-colors text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={confirmCreatePlaylist}
            disabled={!newPlaylistName.trim() || tempTracks.length === 0}
            className="flex items-center space-x-2 px-4 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded transition-colors text-sm"
          >
            <Save className="w-3 h-3" />
            <span>Crear Playlist</span>
          </button>
        </div>
      </div>
    ) : (
      <>
        {/* Botón crear nueva playlist */}
        <button
          onClick={startCreatingPlaylist}
          className="w-full flex items-center justify-center space-x-2 p-3 border-2 border-dashed border-blue-600/50 hover:border-blue-600 rounded-lg transition-colors mb-4"
        >
          <Plus className="w-5 h-5 text-blue-400" />
          <span className="text-blue-400 font-medium">Crear Nueva Playlist</span>
        </button>

        {/* Lista de playlists existentes */}
        {playlists.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm text-gray-400 mb-2">Playlists Existentes:</div>
            {playlists.map(playlist => (
              <div key={playlist.id} className="bg-gray-800/30 rounded-lg p-3">
                {editingPlaylist === playlist.id ? (
                  <input
                    type="text"
                    defaultValue={playlist.name}
                    className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm mb-2"
                    onBlur={(e) => updatePlaylistName(playlist.id, e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        updatePlaylistName(playlist.id, e.target.value);
                      }
                    }}
                    autoFocus
                  />
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="text-white font-medium">{playlist.name}</div>
                        <div className="text-xs text-gray-400">{playlist.tracks?.length || 0} canciones</div>
                      </div>
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => setEditingPlaylist(playlist.id)}
                          className="p-1 hover:bg-gray-700 rounded transition-colors"
                          title="Editar nombre"
                        >
                          <Edit3 className="w-3 h-3 text-gray-400" />
                        </button>
                        <button
                          onClick={() => deletePlaylist(playlist.id)}
                          className="p-1 hover:bg-red-600/30 rounded transition-colors"
                          title="Eliminar playlist"
                        >
                          <Trash2 className="w-3 h-3 text-red-400" />
                        </button>
                      </div>
                    </div>

                    <button
                      onClick={() => selectAndPlayPlaylist(playlist)}
                      className="w-full flex items-center justify-center space-x-2 py-2 bg-green-600 hover:bg-green-700 rounded transition-colors"
                    >
                      <Play className="w-4 h-4" />
                      <span className="text-sm">Seleccionar y Reproducir</span>
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {playlists.length === 0 && !creatingPlaylist && (
          <div className="text-center text-gray-500 text-sm py-8">
            <Music className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No tienes playlists aún.</p>
            <p className="text-xs mt-1">Crea tu primera playlist para comenzar</p>
          </div>
        )}
      </>
    )}
  </div>
);

export default PlaylistManager;
