import React from 'react';
import { Music } from 'lucide-react';
import { FaSpotify, FaYoutube, FaApple } from 'react-icons/fa';

// Platform selector grid (Spotify / YouTube / Apple / Local). Presentational.
const PlatformButtons = ({
  handleSpotify,
  handleYouTubeMusic,
  handleAppleMusic,
  handleLocalPlayer
}) => (
  <div className="grid grid-cols-2 sm:grid-cols-2 gap-2">
    <button
      onClick={handleSpotify}
      className="platform-button flex flex-col sm:flex-row items-center justify-center space-y-1 sm:space-y-0 sm:space-x-2 p-3 bg-green-600 hover:bg-green-700 rounded-xl transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105"
    >
      <FaSpotify className="w-5 h-5" />
      <span className="text-xs sm:text-sm font-medium">Spotify</span>
    </button>

    <button
      onClick={handleYouTubeMusic}
      className="platform-button flex flex-col sm:flex-row items-center justify-center space-y-1 sm:space-y-0 sm:space-x-2 p-3 bg-red-600 hover:bg-red-700 rounded-xl transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105"
    >
      <FaYoutube className="w-5 h-5" />
      <span className="text-xs sm:text-sm font-medium">YouTube</span>
    </button>

    <button
      onClick={handleAppleMusic}
      className="platform-button flex flex-col sm:flex-row items-center justify-center space-y-1 sm:space-y-0 sm:space-x-2 p-3 bg-gray-800 hover:bg-gray-700 rounded-xl transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105"
    >
      <FaApple className="w-5 h-5" />
      <span className="text-xs sm:text-sm font-medium">Apple</span>
    </button>

    <button
      onClick={handleLocalPlayer}
      className="platform-button flex flex-col sm:flex-row items-center justify-center space-y-1 sm:space-y-0 sm:space-x-2 p-3 bg-blue-600 hover:bg-blue-700 rounded-xl transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105"
    >
      <Music className="w-5 h-5" />
      <span className="text-xs sm:text-sm font-medium">Local</span>
    </button>
  </div>
);

export default PlatformButtons;
