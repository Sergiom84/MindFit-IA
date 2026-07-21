import React from 'react';
import { Pause, MoreHorizontal } from 'lucide-react';
import { formatTime } from './audioUtils';

// Minimized (compact) player. Presentational: all state/handlers via props.
const MinimizedPlayer = ({
  bubbleRef,
  position,
  onMouseDown,
  onTouchStart,
  togglePlay,
  isPlaying,
  currentTrack,
  currentTime,
  duration,
  onMaximize
}) => (
  <div
    ref={bubbleRef}
    className="fixed z-50 bg-gray-900/95 backdrop-blur-lg rounded-2xl shadow-2xl border border-gray-700/50 cursor-move audio-control-backdrop touch-none"
    style={{
      left: `${position.x}px`,
      top: `${position.y}px`,
    }}
    onMouseDown={onMouseDown}
    onTouchStart={onTouchStart}
  >
    <div className="flex items-center space-x-3 p-3">
      {/* Play/Pause Button */}
      <button
        onClick={togglePlay}
        className="w-12 h-12 bg-gradient-to-br from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
      >
        {isPlaying ? (
          <Pause className="w-5 h-5 text-gray-900" />
        ) : (
          <img
            src="/assets/tech-lux/play.webp"
            alt="Reproducir"
            className="h-5 w-5 object-contain pointer-events-none select-none"
            draggable="false"
          />
        )}
      </button>

      {/* Track Info */}
      <div className="flex-1 min-w-0">
        <div className="text-white text-sm font-medium truncate">
          {currentTrack.name}
        </div>
        <div className="text-xs text-gray-400">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      </div>

      {/* Maximize Button */}
      <button
        onClick={onMaximize}
        className="control-button w-8 h-8 hover:bg-gray-700/50 rounded-lg transition-all duration-200 flex items-center justify-center"
        title="Maximizar"
      >
        <MoreHorizontal className="w-4 h-4 text-gray-400" />
      </button>
    </div>
  </div>
);

export default MinimizedPlayer;
