import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Repeat, Shuffle, Music, Upload, X, List } from 'lucide-react';

const LocalMusicPlayer = ({ onTrackChange, exerciseSync = false, currentExercise = null }) => {
  const [playlist, setPlaylist] = useState([]);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [isShuffled, setIsShuffled] = useState(false);
  const [repeatMode, setRepeatMode] = useState('none'); // none, track, all
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [crossfade, setCrossfade] = useState(false);
  const [crossfadeDuration, setCrossfadeDuration] = useState(3);
  
  const audioRef = useRef(null);
  const nextAudioRef = useRef(null);
  const fileInputRef = useRef(null);

  // Load files from localStorage on mount
  useEffect(() => {
    const savedPlaylist = localStorage.getItem('localMusicPlaylist');
    if (savedPlaylist) {
      try {
        const parsed = JSON.parse(savedPlaylist);
        setPlaylist(parsed);
        if (parsed.length > 0) {
          setCurrentTrack(parsed[0]);
          setCurrentIndex(0);
        }
      } catch (error) {
        console.error('Error loading saved playlist:', error);
      }
    }
  }, []);

  // Save playlist to localStorage
  useEffect(() => {
    if (playlist.length > 0) {
      localStorage.setItem('localMusicPlaylist', JSON.stringify(playlist));
    }
  }, [playlist]);

  // Audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      
      // Crossfade logic
      if (crossfade && duration - audio.currentTime <= crossfadeDuration) {
        startCrossfade();
      }
    };

    const handleEnded = () => {
      handleTrackEnd();
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [currentTrack, crossfade, crossfadeDuration, duration]);

  // Exercise-based music filtering
  useEffect(() => {
    if (exerciseSync && currentExercise && playlist.length > 0) {
      const suitableTracks = filterTracksByExercise(currentExercise);
      if (suitableTracks.length > 0) {
        const randomTrack = suitableTracks[Math.floor(Math.random() * suitableTracks.length)];
        const trackIndex = playlist.findIndex(track => track.id === randomTrack.id);
        if (trackIndex !== -1) {
          setCurrentIndex(trackIndex);
          setCurrentTrack(randomTrack);
        }
      }
    }
  }, [currentExercise, exerciseSync, playlist]);

  const filterTracksByExercise = (exercise) => {
    // Simple filtering based on track names and metadata
    const exerciseType = exercise.type?.toLowerCase();
    const intensity = exercise.intensity?.toLowerCase();
    
    let keywords = [];
    
    switch (exerciseType) {
      case 'cardio':
      case 'hiit':
        keywords = ['pump', 'energy', 'power', 'beast', 'fire', 'high', 'fast'];
        break;
      case 'strength':
      case 'powerlifting':
        keywords = ['strong', 'power', 'heavy', 'beast', 'metal', 'rock'];
        break;
      case 'yoga':
      case 'stretching':
        keywords = ['calm', 'peace', 'zen', 'flow', 'breath', 'relax'];
        break;
      case 'functional':
        keywords = ['move', 'flow', 'rhythm', 'dynamic', 'energy'];
        break;
      default:
        return playlist;
    }
    
    return playlist.filter(track => {
      const trackText = `${track.name} ${track.artist || ''}`.toLowerCase();
      return keywords.some(keyword => trackText.includes(keyword)) || 
             Math.random() > 0.7; // Include some random tracks for variety
    });
  };

  const addFiles = (files) => {
    const newTracks = [];
    
    Array.from(files).forEach((file, index) => {
      if (file.type.startsWith('audio/')) {
        const url = URL.createObjectURL(file);
        const track = {
          id: `local_${Date.now()}_${index}`,
          name: file.name.replace(/\.[^/.]+$/, ""), // Remove extension
          artist: 'Local File',
          url: url,
          file: file,
          duration: 0, // Will be set when loaded
          size: file.size,
          type: file.type,
          lastModified: file.lastModified
        };
        newTracks.push(track);
      }
    });
    
    if (newTracks.length > 0) {
      setPlaylist(prev => [...prev, ...newTracks]);
      
      // Set first track if playlist was empty
      if (playlist.length === 0 && newTracks.length > 0) {
        setCurrentTrack(newTracks[0]);
        setCurrentIndex(0);
      }
    }
  };

  const handleFileInput = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      addFiles(files);
    }
    // Reset input
    e.target.value = '';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      addFiles(files);
    }
  };

  const togglePlay = () => {
    if (!audioRef.current || !currentTrack) return;
    
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const nextTrack = () => {
    if (playlist.length === 0) return;
    
    let nextIndex;
    if (isShuffled) {
      nextIndex = Math.floor(Math.random() * playlist.length);
    } else {
      nextIndex = (currentIndex + 1) % playlist.length;
    }
    
    setCurrentIndex(nextIndex);
    setCurrentTrack(playlist[nextIndex]);
    setCurrentTime(0);
  };

  const prevTrack = () => {
    if (playlist.length === 0) return;
    
    let prevIndex;
    if (isShuffled) {
      prevIndex = Math.floor(Math.random() * playlist.length);
    } else {
      prevIndex = currentIndex === 0 ? playlist.length - 1 : currentIndex - 1;
    }
    
    setCurrentIndex(prevIndex);
    setCurrentTrack(playlist[prevIndex]);
    setCurrentTime(0);
  };

  const handleTrackEnd = () => {
    if (repeatMode === 'track') {
      audioRef.current.currentTime = 0;
      audioRef.current.play();
    } else if (repeatMode === 'all' || currentIndex < playlist.length - 1) {
      nextTrack();
    } else {
      setIsPlaying(false);
    }
  };

  const selectTrack = (track, index) => {
    setCurrentTrack(track);
    setCurrentIndex(index);
    setCurrentTime(0);
    setShowPlaylist(false);
  };

  const removeTrack = (trackId) => {
    const newPlaylist = playlist.filter(track => track.id !== trackId);
    setPlaylist(newPlaylist);
    
    // Adjust current index if needed
    const removedIndex = playlist.findIndex(track => track.id === trackId);
    if (removedIndex < currentIndex) {
      setCurrentIndex(currentIndex - 1);
    } else if (removedIndex === currentIndex) {
      if (newPlaylist.length > 0) {
        const newIndex = Math.min(currentIndex, newPlaylist.length - 1);
        setCurrentIndex(newIndex);
        setCurrentTrack(newPlaylist[newIndex]);
      } else {
        setCurrentTrack(null);
        setCurrentIndex(0);
      }
    }
  };

  const clearPlaylist = () => {
    // Revoke all object URLs to prevent memory leaks
    playlist.forEach(track => {
      if (track.url.startsWith('blob:')) {
        URL.revokeObjectURL(track.url);
      }
    });
    
    setPlaylist([]);
    setCurrentTrack(null);
    setCurrentIndex(0);
    setIsPlaying(false);
    localStorage.removeItem('localMusicPlaylist');
  };

  const startCrossfade = () => {
    if (!crossfade || currentIndex >= playlist.length - 1) return;
    
    const nextIndex = (currentIndex + 1) % playlist.length;
    const nextTrack = playlist[nextIndex];
    
    if (nextAudioRef.current && nextTrack) {
      nextAudioRef.current.src = nextTrack.url;
      nextAudioRef.current.volume = 0;
      nextAudioRef.current.play();
      
      // Fade out current, fade in next
      const fadeInterval = setInterval(() => {
        if (audioRef.current.volume > 0.1) {
          audioRef.current.volume -= 0.1;
          nextAudioRef.current.volume += 0.1;
        } else {
          clearInterval(fadeInterval);
          // Switch tracks
          [audioRef.current, nextAudioRef.current] = [nextAudioRef.current, audioRef.current];
          setCurrentIndex(nextIndex);
          setCurrentTrack(nextTrack);
          audioRef.current.volume = volume * (isMuted ? 0 : 1);
        }
      }, crossfadeDuration * 100);
    }
  };

  const formatTime = (time) => {
    if (!time) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleSeek = (e) => {
    if (!audioRef.current || !duration) return;
    
    const rect = e.target.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * duration;
    
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // Notify parent component of track changes
  useEffect(() => {
    if (onTrackChange && currentTrack) {
      onTrackChange({
        track: currentTrack,
        isPlaying,
        currentTime,
        duration
      });
    }
  }, [currentTrack, isPlaying, currentTime, duration, onTrackChange]);

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center space-x-2">
          <Music className="w-5 h-5 text-blue-500" />
          <span className="text-white font-medium">Reproductor Local</span>
          <span className="text-xs text-gray-500">({playlist.length} tracks)</span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 hover:bg-gray-700 rounded transition-colors"
            title="Añadir música"
          >
            <Upload className="w-4 h-4 text-gray-400" />
          </button>
          <button
            onClick={() => setShowPlaylist(!showPlaylist)}
            className="p-2 hover:bg-gray-700 rounded transition-colors"
            title="Mostrar playlist"
          >
            <List className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Current Track Info */}
      {currentTrack ? (
        <div className="p-4 border-b border-gray-700">
          <div className="text-white font-medium truncate">{currentTrack.name}</div>
          <div className="text-gray-400 text-sm">{currentTrack.artist}</div>
        </div>
      ) : (
        <div 
          className="p-8 border-b border-gray-700 border-dashed border-gray-600 text-center"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <Upload className="w-8 h-8 text-gray-500 mx-auto mb-2" />
          <p className="text-gray-400 mb-2">Arrastra archivos de música aquí</p>
          <p className="text-xs text-gray-500">o haz clic en el botón + para seleccionar archivos</p>
        </div>
      )}

      {/* Progress Bar */}
      {currentTrack && (
        <div className="px-4 py-2">
          <div 
            className="w-full h-2 bg-gray-700 rounded cursor-pointer"
            onClick={handleSeek}
          >
            <div 
              className="h-full bg-blue-500 rounded"
              style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
            />
          </div>
          <div className="flex justify-between mt-1 text-xs text-gray-400">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsShuffled(!isShuffled)}
            className={`p-2 rounded transition-colors ${
              isShuffled ? 'bg-blue-600 text-white' : 'hover:bg-gray-700 text-gray-400'
            }`}
            title="Aleatorio"
          >
            <Shuffle className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => {
              const modes = ['none', 'track', 'all'];
              const currentModeIndex = modes.indexOf(repeatMode);
              const nextMode = modes[(currentModeIndex + 1) % modes.length];
              setRepeatMode(nextMode);
            }}
            className={`p-2 rounded transition-colors ${
              repeatMode !== 'none' ? 'bg-blue-600 text-white' : 'hover:bg-gray-700 text-gray-400'
            }`}
            title={`Repetir: ${repeatMode}`}
          >
            <Repeat className="w-4 h-4" />
            {repeatMode === 'track' && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-400 rounded-full" />
            )}
          </button>
        </div>

        <div className="flex items-center space-x-4">
          <button
            onClick={prevTrack}
            disabled={playlist.length === 0}
            className="p-2 hover:bg-gray-700 disabled:opacity-50 rounded transition-colors"
          >
            <SkipBack className="w-5 h-5 text-gray-400" />
          </button>
          
          <button
            onClick={togglePlay}
            disabled={!currentTrack}
            className="w-10 h-10 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-full flex items-center justify-center transition-colors"
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 text-white" />
            ) : (
              <Play className="w-5 h-5 text-white ml-1" />
            )}
          </button>
          
          <button
            onClick={nextTrack}
            disabled={playlist.length === 0}
            className="p-2 hover:bg-gray-700 disabled:opacity-50 rounded transition-colors"
          >
            <SkipForward className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 hover:bg-gray-700 rounded transition-colors"
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4 text-gray-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-gray-400" />
            )}
          </button>
          
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={isMuted ? 0 : volume}
            onChange={(e) => {
              const newVolume = parseFloat(e.target.value);
              setVolume(newVolume);
              setIsMuted(newVolume === 0);
              if (audioRef.current) {
                audioRef.current.volume = newVolume;
              }
            }}
            className="w-20 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
        </div>
      </div>

      {/* Exercise Sync Indicator */}
      {exerciseSync && currentExercise && (
        <div className="px-4 pb-4">
          <div className="flex items-center space-x-2 p-2 bg-blue-600/10 border border-blue-600/20 rounded">
            <Music className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-blue-400">
              Sincronizado con: {currentExercise.name}
            </span>
          </div>
        </div>
      )}

      {/* Playlist */}
      {showPlaylist && (
        <div className="border-t border-gray-700 max-h-64 overflow-y-auto">
          <div className="flex items-center justify-between p-3 border-b border-gray-700">
            <span className="text-sm font-medium text-white">Playlist</span>
            <button
              onClick={clearPlaylist}
              className="text-xs text-red-400 hover:text-red-300"
              disabled={playlist.length === 0}
            >
              Limpiar todo
            </button>
          </div>
          
          <div className="space-y-1">
            {playlist.map((track, index) => (
              <div
                key={track.id}
                className={`flex items-center justify-between p-2 hover:bg-gray-700 cursor-pointer ${
                  index === currentIndex ? 'bg-gray-700' : ''
                }`}
                onClick={() => selectTrack(track, index)}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{track.name}</div>
                  <div className="text-xs text-gray-400">{track.artist}</div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTrack(track.id);
                  }}
                  className="p-1 hover:bg-red-600/20 rounded transition-colors"
                >
                  <X className="w-3 h-3 text-red-400" />
                </button>
              </div>
            ))}
          </div>
          
          {playlist.length === 0 && (
            <div className="p-4 text-center text-gray-500">
              <Music className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No hay música en la playlist</p>
            </div>
          )}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        multiple
        onChange={handleFileInput}
        className="hidden"
      />

      {/* Hidden audio elements */}
      {currentTrack && (
        <>
          <audio
            ref={audioRef}
            src={currentTrack.url}
            volume={isMuted ? 0 : volume}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />
          <audio ref={nextAudioRef} />
        </>
      )}
    </div>
  );
};

export default LocalMusicPlayer;