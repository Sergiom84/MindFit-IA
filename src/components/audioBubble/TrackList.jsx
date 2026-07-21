import React from 'react';
import { X } from 'lucide-react';

// Tracklist of the current playlist. Presentational; visibility guarded by parent.
const TrackList = ({
  currentPlaylist,
  currentTrackIndex,
  playTrackAtIndex,
  removeTrackFromPlaylist,
  onClose
}) => (
  <div className="bg-gray-800/50 border border-gray-600/30 rounded-lg p-3">
    <div className="flex items-center justify-between mb-2">
      <div className="text-sm text-white font-medium">Tracklist:</div>
      <button
        onClick={onClose}
        className="p-1 hover:bg-gray-700 rounded transition-colors"
      >
        <X className="w-3 h-3 text-gray-400" />
      </button>
    </div>
    <div className="space-y-1 max-h-40 overflow-y-auto">
      {currentPlaylist.tracks.map((track, index) => (
        <button
          key={track.id}
          onClick={() => playTrackAtIndex(index)}
          className={`w-full text-left p-2 rounded text-xs transition-colors ${
            index === currentTrackIndex
              ? 'bg-yellow-400/20 text-yellow-400'
              : 'hover:bg-gray-700/30 text-gray-300'
          }`}
        >
          <div className="flex items-center space-x-2">
            <span className="w-4 text-center">
              {index === currentTrackIndex ? '▶' : index + 1}
            </span>
            <span className="flex-1 truncate">{track.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeTrackFromPlaylist(currentPlaylist.id, track.id);
              }}
              className="p-0.5 hover:bg-red-600/30 rounded transition-colors"
              title="Eliminar de playlist"
            >
              <X className="w-3 h-3 text-red-400" />
            </button>
          </div>
        </button>
      ))}
    </div>
  </div>
);

export default TrackList;
