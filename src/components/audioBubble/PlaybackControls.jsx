import React from 'react';
import { Play, Pause, SkipForward, SkipBack } from 'lucide-react';

// Prev / Play-Pause / Next controls. Presentational.
const PlaybackControls = ({
  playPrevious,
  togglePlay,
  playNext,
  currentPlaylist,
  currentTrack,
  isPlaying
}) => (
  <div className="flex items-center justify-center space-x-4">
    {/* Previous Track */}
    <button
      onClick={playPrevious}
      disabled={!currentPlaylist || !currentPlaylist.tracks || currentPlaylist.tracks.length <= 1}
      className="control-button w-10 h-10 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:opacity-50 rounded-full flex items-center justify-center transition-all duration-200"
    >
      <SkipBack className="w-5 h-5 text-white" />
    </button>

    {/* Play/Pause Button */}
    <button
      onClick={togglePlay}
      disabled={!currentTrack}
      className={`control-button w-14 h-14 bg-gradient-to-br from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 disabled:from-gray-600 disabled:to-gray-700 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 ${
        isPlaying ? 'play-button-playing' : ''
      }`}
    >
      {isPlaying ? (
        <Pause className="w-7 h-7 text-gray-900" />
      ) : (
        <Play className="w-7 h-7 text-gray-900 ml-1" />
      )}
    </button>

    {/* Next Track */}
    <button
      onClick={playNext}
      disabled={!currentPlaylist || !currentPlaylist.tracks || currentPlaylist.tracks.length <= 1}
      className="control-button w-10 h-10 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:opacity-50 rounded-full flex items-center justify-center transition-all duration-200"
    >
      <SkipForward className="w-5 h-5 text-white" />
    </button>
  </div>
);

export default PlaybackControls;
