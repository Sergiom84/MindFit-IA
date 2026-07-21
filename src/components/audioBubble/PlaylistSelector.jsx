import React from 'react';

// Playlist switcher dropdown. Presentational; visibility guarded by parent.
const PlaylistSelector = ({ playlists, currentPlaylist, onSelectPlaylist }) => (
  <div className="bg-gray-800/50 border border-gray-600/30 rounded-lg p-3">
    <div className="text-sm text-white font-medium mb-2">Cambiar Playlist:</div>
    <div className="space-y-2 max-h-32 overflow-y-auto">
      {playlists.map(playlist => (
        <button
          key={playlist.id}
          onClick={() => onSelectPlaylist(playlist)}
          className={`w-full text-left p-2 rounded transition-colors ${
            currentPlaylist?.id === playlist.id
              ? 'bg-green-600/30 text-green-400'
              : 'hover:bg-gray-700/50 text-gray-300'
          }`}
        >
          <div className="text-sm font-medium">{playlist.name}</div>
          <div className="text-xs text-gray-400">{playlist.tracks?.length || 0} canciones</div>
        </button>
      ))}
    </div>
  </div>
);

export default PlaylistSelector;
