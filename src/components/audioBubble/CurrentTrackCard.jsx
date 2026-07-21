import React from 'react';
import { Music } from 'lucide-react';
import { formatTime } from './audioUtils';

// Current track card with progress bar. Presentational; guarded internally.
const CurrentTrackCard = ({
  currentTrack,
  currentPlatform,
  handleProgressClick,
  currentTime,
  duration
}) => {
  if (!currentTrack) return null;

  return (
    <div className="mx-4 mt-4 p-4 bg-gradient-to-r from-gray-800/50 to-gray-700/30 rounded-xl border border-gray-600/30">
      <div className="flex items-center space-x-3 mb-3">
        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
          <Music className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-white font-medium text-sm truncate">
            {currentTrack.name || 'Reproduciendo...'}
          </div>
          <div className="text-gray-400 text-xs capitalize">
            {currentPlatform}
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div
          className="relative h-2 bg-gray-700 rounded-full cursor-pointer"
          onClick={handleProgressClick}
        >
          <div
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 to-purple-600 rounded-full transition-all duration-300"
            style={{
              width: `${duration ? (currentTime / duration) * 100 : 0}%`
            }}
          />
          {/* Progress thumb */}
          <div
            className="absolute top-1/2 transform -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md transition-all duration-300"
            style={{
              left: `${duration ? (currentTime / duration) * 100 : 0}%`,
              marginLeft: '-6px'
            }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
};

export default CurrentTrackCard;
