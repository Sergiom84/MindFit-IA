import { alertDialog } from './ui/dialogService.jsx';
import React, { useState, useRef, useEffect, memo } from 'react';
import { Pause, Music, Volume2, X, Minus, List } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePlaylistDB } from '../hooks/usePlaylistDB';
import { BUBBLE_SIZE, BUBBLE_MARGIN, DRAG_THRESHOLD_PX } from './audioBubble/constants';
import { getExerciseBasedMusic } from './audioBubble/audioUtils';
import MinimizedPlayer from './audioBubble/MinimizedPlayer';
import CurrentTrackCard from './audioBubble/CurrentTrackCard';
import PlaybackControls from './audioBubble/PlaybackControls';
import PlatformButtons from './audioBubble/PlatformButtons';
import PlaylistSelector from './audioBubble/PlaylistSelector';
import TrackList from './audioBubble/TrackList';
import PlaylistManager from './audioBubble/PlaylistManager';
import './AudioBubble.css';

const AudioBubble = ({ musicConfig = {}, currentExercise = null }) => {
  const { user } = useAuth();
  const {
    playlists,
    loading: playlistLoading,
    error: playlistError,
    createPlaylist: createPlaylistDB,
    updatePlaylist: updatePlaylistDB,
    deletePlaylist: deletePlaylistDB,
    addTrackToPlaylist: addTrackToPlaylistDB,
    removeTrackFromPlaylist: removeTrackFromPlaylistDB
  } = usePlaylistDB(user?.id);

  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlatform, setCurrentPlatform] = useState(null);
  // Spawn en el borde derecho, centrado verticalmente: la esquina inferior
  // derecha (spawn original) queda siempre debajo del CTA principal del
  // reproductor de sesión (p.ej. "Guardar Serie") y de la barra de
  // navegación inferior, tapándolos por completo (burbuja arrastrable pero
  // sin memoria de posición, así que reaparece encima en cada carga).
  const [position, setPosition] = useState({
    x: window.innerWidth - (BUBBLE_SIZE + BUBBLE_MARGIN),
    y: Math.round(window.innerHeight / 2 - BUBBLE_SIZE / 2)
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [currentTrack, setCurrentTrack] = useState(null);
  const [volume, setVolume] = useState(0.8);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  // Playlist states
  const [currentPlaylist, setCurrentPlaylist] = useState(null);
  const [showPlaylistManager, setShowPlaylistManager] = useState(false);
  const [editingPlaylist, setEditingPlaylist] = useState(null);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [tempTracks, setTempTracks] = useState([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [showPlaylistSelector, setShowPlaylistSelector] = useState(false);
  const [showTrackList, setShowTrackList] = useState(false);
  
  const audioRef = useRef(null);
  const bubbleRef = useRef(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const dragMovedRef = useRef(false);

  // Dragging functionality (mouse + touch)
  const handleMouseDown = (e) => {
    if (e.target.closest('.platform-button') || e.target.closest('.control-button')) return;

    dragMovedRef.current = false;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    setIsDragging(true);
    const rect = bubbleRef.current.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;

    const deltaX = Math.abs(e.clientX - dragStartRef.current.x);
    const deltaY = Math.abs(e.clientY - dragStartRef.current.y);
    if (!dragMovedRef.current && (deltaX > DRAG_THRESHOLD_PX || deltaY > DRAG_THRESHOLD_PX)) {
      dragMovedRef.current = true;
    }

    const newX = Math.max(0, Math.min(window.innerWidth - BUBBLE_SIZE, e.clientX - dragOffset.x));
    const newY = Math.max(0, Math.min(window.innerHeight - BUBBLE_SIZE, e.clientY - dragOffset.y));

    setPosition({ x: newX, y: newY });
  };

  const handleTouchStart = (e) => {
    if (e.target.closest('.platform-button') || e.target.closest('.control-button')) return;
    const touch = e.touches?.[0];
    if (!touch) return;

    dragMovedRef.current = false;
    dragStartRef.current = { x: touch.clientX, y: touch.clientY };
    setIsDragging(true);
    const rect = bubbleRef.current.getBoundingClientRect();
    setDragOffset({
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top
    });
  };

  const handleTouchMove = (e) => {
    if (!isDragging) return;
    const touch = e.touches?.[0];
    if (!touch) return;

    const deltaX = Math.abs(touch.clientX - dragStartRef.current.x);
    const deltaY = Math.abs(touch.clientY - dragStartRef.current.y);
    if (!dragMovedRef.current && (deltaX > DRAG_THRESHOLD_PX || deltaY > DRAG_THRESHOLD_PX)) {
      dragMovedRef.current = true;
    }

    const newX = Math.max(0, Math.min(window.innerWidth - BUBBLE_SIZE, touch.clientX - dragOffset.x));
    const newY = Math.max(0, Math.min(window.innerHeight - BUBBLE_SIZE, touch.clientY - dragOffset.y));

    setPosition({ x: newX, y: newY });

    if (dragMovedRef.current) {
      e.preventDefault();
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleTouchEnd);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [isDragging, dragOffset]);

  // Audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handlePlay = () => {
      setIsPlaying(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      // Auto-play next track in playlist
      if (currentPlaylist && currentPlaylist.tracks && currentPlaylist.tracks.length > 1) {
        playNext();
      }
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [currentTrack]);

  // Platform handlers
  const handleSpotify = () => {
    if (!musicConfig?.spotify?.enabled) {
      alertDialog('Spotify no está configurado. Ve a Perfil → Configuración de Música');
      return;
    }
    setCurrentPlatform('spotify');
    // Spotify Web API integration
    openSpotifyWebPlayer();
  };

  const handleYouTubeMusic = () => {
    if (!musicConfig?.youtube?.enabled) {
      alertDialog('YouTube Music no está configurado. Ve a Perfil → Configuración de Música');
      return;
    }
    setCurrentPlatform('youtube');
    window.open('https://music.youtube.com', '_blank');
  };

  const handleAppleMusic = () => {
    if (!musicConfig?.apple?.enabled) {
      alertDialog('Apple Music no está configurado. Ve a Perfil → Configuración de Música');
      return;
    }
    setCurrentPlatform('apple');
    window.open('https://music.apple.com', '_blank');
  };

  const handleLocalPlayer = () => {
    setCurrentPlatform('local');
    setShowPlaylistManager(true);
  };

  // Spotify Web Player
  const openSpotifyWebPlayer = () => {
    if (musicConfig?.spotify?.accessToken) {
      // Use Spotify Web API
      initializeSpotifyPlayer();
    } else {
      // Redirect to Spotify authorization
      const clientId = musicConfig?.spotify?.clientId;
      const redirectUri = encodeURIComponent(window.location.origin + '/spotify-callback');
      const scopes = encodeURIComponent('streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state');
      
      const authUrl = `https://accounts.spotify.com/authorize?response_type=code&client_id=${clientId}&scope=${scopes}&redirect_uri=${redirectUri}`;
      window.open(authUrl, '_blank');
    }
  };

  const initializeSpotifyPlayer = () => {
    if (window.Spotify) {
      const player = new window.Spotify.Player({
        name: 'MindFit Player',
        getOAuthToken: cb => { cb(musicConfig?.spotify?.accessToken); },
        volume: volume
      });

      player.connect();
      setCurrentTrack({ platform: 'spotify', player });
    }
  };

  // Temp file handler for playlist creation
  const handleTempFiles = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      addFilesToTemp(files);
    }
    e.target.value = '';
  };

  // Local file handler
  const handleLocalFile = async (e) => {
    const files = Array.from(e.target.files);
    
    for (const file of files) {
      if (file && file.type.startsWith('audio/')) {
        const url = URL.createObjectURL(file);
        const track = {
          id: Date.now().toString() + Math.random().toString(36),
          platform: 'local', 
          name: file.name.replace(/\.[^/.]+$/, ''), // Remove file extension
          url: url,
          file: file,
          size: file.size,
          type: file.type
        };

        // If it's the first file and no current track, set it as current
        if (!currentTrack) {
          setIsPlaying(false);
          setCurrentTime(0);
          setDuration(0);
          
          if (audioRef.current) {
            audioRef.current.src = url;
          }
          setCurrentTrack(track);
          setCurrentPlatform('local');
        }

        // Add to current playlist if one is selected
        if (currentPlaylist) {
          try {
            await addTrackToPlaylist(currentPlaylist.id, track);
            console.log(`✅ Añadida "${track.name}" a playlist "${currentPlaylist.name}"`);
          } catch (error) {
            console.error('Error adding track to playlist:', error);
          }
        } else {
          console.log('⚠️ No hay playlist seleccionada. Selecciona una playlist primero.');
        }
      }
    }
    
    // Reset the input
    e.target.value = '';
  };

  // Handle progress bar click
  const handleProgressClick = (e) => {
    if (!audioRef.current || !duration) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * duration;
    
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // Playlist management functions
  const createPlaylist = async (name) => {
    const newPlaylist = await createPlaylistDB(name.trim());
    setNewPlaylistName('');
    return newPlaylist;
  };

  const updatePlaylistName = async (playlistId, newName) => {
    await updatePlaylistDB(playlistId, { name: newName.trim() });
    setEditingPlaylist(null);
  };

  const deletePlaylist = async (playlistId) => {
    await deletePlaylistDB(playlistId);
    if (currentPlaylist?.id === playlistId) {
      setCurrentPlaylist(null);
    }
  };

  const addTrackToPlaylist = async (playlistId, track) => {
    await addTrackToPlaylistDB(playlistId, track);
  };

  const removeTrackFromPlaylist = async (playlistId, trackId) => {
    await removeTrackFromPlaylistDB(playlistId, trackId);
  };

  const selectPlaylist = (playlist) => {
    setCurrentPlaylist(playlist);
    if (playlist.tracks && playlist.tracks.length > 0) {
      const firstTrack = playlist.tracks[0];
      setCurrentTrack(firstTrack);
      setCurrentPlatform('local');
      if (audioRef.current && firstTrack.url) {
        audioRef.current.src = firstTrack.url;
      }
    }
  };

  // New playlist creation functions
  const startCreatingPlaylist = () => {
    setCreatingPlaylist(true);
    setNewPlaylistName('');
    setTempTracks([]);
  };

  const cancelCreatingPlaylist = () => {
    setCreatingPlaylist(false);
    setNewPlaylistName('');
    setTempTracks([]);
    // Revoke temp URLs
    tempTracks.forEach(track => {
      if (track.url.startsWith('blob:')) {
        URL.revokeObjectURL(track.url);
      }
    });
  };

  const addFilesToTemp = (files) => {
    const newTracks = [];
    Array.from(files).forEach((file, index) => {
      if (file && file.type.startsWith('audio/')) {
        const url = URL.createObjectURL(file);
        const track = {
          id: `temp_${Date.now()}_${index}`,
          platform: 'local',
          name: file.name.replace(/\.[^/.]+$/, ''),
          url: url,
          file: file,
          size: file.size,
          type: file.type
        };
        newTracks.push(track);
      }
    });
    setTempTracks(prev => [...prev, ...newTracks]);
  };

  const removeFromTemp = (trackId) => {
    const track = tempTracks.find(t => t.id === trackId);
    if (track && track.url.startsWith('blob:')) {
      URL.revokeObjectURL(track.url);
    }
    setTempTracks(prev => prev.filter(t => t.id !== trackId));
  };

  const confirmCreatePlaylist = async () => {
    if (!newPlaylistName.trim() || tempTracks.length === 0) return;

    try {
      const newPlaylist = await createPlaylistDB(newPlaylistName.trim(), tempTracks);
      if (newPlaylist) {
        setCurrentPlaylist(newPlaylist);
        setCreatingPlaylist(false);
        setNewPlaylistName('');
        setTempTracks([]);
        
        // Start playing first track
        if (tempTracks.length > 0) {
          const firstTrack = tempTracks[0];
          setCurrentTrack(firstTrack);
          if (audioRef.current) {
            audioRef.current.src = firstTrack.url;
          }
        }
      }
    } catch (error) {
      console.error('Error creating playlist:', error);
    }
  };

  const selectAndPlayPlaylist = (playlist) => {
    setCurrentPlaylist(playlist);
    if (playlist.tracks && playlist.tracks.length > 0) {
      const firstTrack = playlist.tracks[0];
      setCurrentTrack(firstTrack);
      setCurrentPlatform('local');
      if (audioRef.current && firstTrack.url) {
        audioRef.current.src = firstTrack.url;
        setCurrentTime(0);
        setDuration(0);
      }
    }
    setShowPlaylistManager(false);
  };

  // Navigation functions for playlist tracks
  const playNext = () => {
    if (!currentPlaylist || !currentPlaylist.tracks || currentPlaylist.tracks.length === 0) return;
    
    const nextIndex = (currentTrackIndex + 1) % currentPlaylist.tracks.length;
    const nextTrack = currentPlaylist.tracks[nextIndex];
    
    setCurrentTrackIndex(nextIndex);
    setCurrentTrack(nextTrack);
    
    if (audioRef.current && nextTrack.url) {
      audioRef.current.src = nextTrack.url;
      setCurrentTime(0);
      setDuration(0);
      if (isPlaying) {
        audioRef.current.play();
      }
    }
  };

  const playPrevious = () => {
    if (!currentPlaylist || !currentPlaylist.tracks || currentPlaylist.tracks.length === 0) return;
    
    const prevIndex = currentTrackIndex === 0 ? currentPlaylist.tracks.length - 1 : currentTrackIndex - 1;
    const prevTrack = currentPlaylist.tracks[prevIndex];
    
    setCurrentTrackIndex(prevIndex);
    setCurrentTrack(prevTrack);
    
    if (audioRef.current && prevTrack.url) {
      audioRef.current.src = prevTrack.url;
      setCurrentTime(0);
      setDuration(0);
      if (isPlaying) {
        audioRef.current.play();
      }
    }
  };

  const playTrackAtIndex = (index) => {
    if (!currentPlaylist || !currentPlaylist.tracks || index < 0 || index >= currentPlaylist.tracks.length) return;
    
    const track = currentPlaylist.tracks[index];
    setCurrentTrackIndex(index);
    setCurrentTrack(track);
    
    if (audioRef.current && track.url) {
      audioRef.current.src = track.url;
      setCurrentTime(0);
      setDuration(0);
      if (isPlaying) {
        audioRef.current.play();
      }
    }
  };

  const clearAllTempTracks = () => {
    tempTracks.forEach(track => {
      if (track.url.startsWith('blob:')) {
        URL.revokeObjectURL(track.url);
      }
    });
    setTempTracks([]);
  };

  // Auto-sync with exercise
  useEffect(() => {
    if (currentExercise && isPlaying && currentPlatform === 'spotify' && musicConfig?.general?.autoSync) {
      const musicParams = getExerciseBasedMusic(currentExercise);
      if (musicParams) {
        searchAndPlayExerciseMusic(musicParams);
      }
    }
  }, [currentExercise, isPlaying, musicConfig?.general?.autoSync]);

  const searchAndPlayExerciseMusic = async (musicParams) => {
    if (!musicConfig?.spotify?.accessToken) return;
    
    try {
      const query = `genre:${musicParams.genre} tempo:${musicParams.bpm-10}-${musicParams.bpm+10}`;
      const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=20`, {
        headers: {
          'Authorization': `Bearer ${musicConfig.spotify.accessToken}`
        }
      });
      
      const data = await response.json();
      if (data.tracks?.items?.length > 0) {
        const randomTrack = data.tracks.items[Math.floor(Math.random() * data.tracks.items.length)];
        playSpotifyTrack(randomTrack.uri);
      }
    } catch (error) {
      console.error('Error syncing music with exercise:', error);
    }
  };

  const playSpotifyTrack = async (trackUri) => {
    if (!musicConfig?.spotify?.accessToken) return;
    
    try {
      await fetch('https://api.spotify.com/v1/me/player/play', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${musicConfig.spotify.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          uris: [trackUri]
        })
      });
    } catch (error) {
      console.error('Error playing Spotify track:', error);
    }
  };

  const togglePlay = () => {
    if (currentPlatform === 'local' && audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(error => {
          console.error('Error playing audio:', error);
        });
      }
      // Don't manually set isPlaying - let the event listeners handle it
    } else if (currentPlatform === 'spotify' && currentTrack?.player) {
      currentTrack.player.togglePlay();
      // For Spotify, we might need to manually toggle since we don't have direct event listeners
      setIsPlaying(!isPlaying);
    }
  };

  if (!isOpen) {
    return (
      <div
        ref={bubbleRef}
        // z-[5] (no z-40/z-50): TODAS las pantallas de contenido de la app
        // (RoutineScreen, MethodologiesScreen, ProfileSection... 8 en total)
        // envuelven su contenido -incluidos los modales que abren, como
        // RoutineSessionModal y su SeriesTrackingModal ("Guardar Serie")- en
        // un <div className="relative z-10 ..."> que crea su PROPIO contexto
        // de apilamiento. Eso significa que el z-50/z-[60] declarado DENTRO
        // de esos modales solo compite contra sus hermanos dentro de ese
        // mismo z-10: a nivel raíz, todo ese árbol pinta como un bloque a
        // "10". Con la burbuja en z-40 o z-50 (ambos > 10) SIEMPRE ganaba y
        // tapaba botones críticos como "Guardar Serie" de forma permanente
        // e inclickable, aunque el modal "dijera" z-60. z-[5] (<10) la deja
        // siempre detrás de cualquier pantalla/modal de la app, conservando
        // su visibilidad sobre el contenido normal sin contenedor z-10.
        className={`fixed z-[5] h-[72px] w-[72px] rounded-full cursor-move flex items-center justify-center hover:scale-105 transition-transform duration-200 touch-none ${
          isPlaying ? 'bubble-pulse' : ''
        }`}
        style={{ left: `${position.x}px`, top: `${position.y}px` }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onClick={() => {
          if (isDragging || dragMovedRef.current) {
            dragMovedRef.current = false;
            return;
          }
          setIsOpen(true);
        }}
      >
        {isPlaying ? (
          <Pause className="w-6 h-6 text-gray-900" />
        ) : (
          <img
            src="/assets/tech-lux/play.webp"
            alt="Reproducir"
            className="h-full w-full object-contain pointer-events-none select-none"
            draggable="false"
          />
        )}
      </div>
    );
  }

  return (
    <>
      {/* Minimized state - compact player */}
      {isMinimized && currentTrack ? (
        <MinimizedPlayer
          bubbleRef={bubbleRef}
          position={position}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          togglePlay={togglePlay}
          isPlaying={isPlaying}
          currentTrack={currentTrack}
          currentTime={currentTime}
          duration={duration}
          onMaximize={() => setIsMinimized(false)}
        />
      ) : (
        /* Expanded modal */
        <div
          ref={bubbleRef}
          className="fixed z-50 bg-gray-900/98 backdrop-blur-md border border-gray-600/50 rounded-2xl shadow-2xl cursor-move touch-none"
          style={{ 
            left: `${position.x}px`, 
            top: `${position.y}px`,
            width: window.innerWidth < 640 ? '300px' : '320px',
            minHeight: '280px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)'
          }}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
        >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700/50">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-lg flex items-center justify-center">
              <Music className="w-4 h-4 text-gray-900" />
            </div>
            <span className="text-white font-semibold text-lg">Audio Control</span>
          </div>
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setIsMinimized(true)}
              className="control-button p-1.5 hover:bg-gray-700/50 rounded-lg transition-all duration-200"
              title="Minimizar"
            >
              <Minus className="w-4 h-4 text-gray-400" />
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="control-button p-1.5 hover:bg-gray-700/50 rounded-lg transition-all duration-200"
              title="Cerrar"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Full content */}
          <>
            {/* Current Track Card */}
            <CurrentTrackCard
              currentTrack={currentTrack}
              currentPlatform={currentPlatform}
              handleProgressClick={handleProgressClick}
              currentTime={currentTime}
              duration={duration}
            />

        {/* Controls */}
        <div className="p-4 space-y-4">
          {/* Playback Controls */}
          <PlaybackControls
            playPrevious={playPrevious}
            togglePlay={togglePlay}
            playNext={playNext}
            currentPlaylist={currentPlaylist}
            currentTrack={currentTrack}
            isPlaying={isPlaying}
          />

          {/* Track Info & Playlist Selector */}
          {currentPlaylist && (
            <div className="flex items-center justify-between text-xs text-gray-400">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowPlaylistSelector(!showPlaylistSelector)}
                  className="flex items-center space-x-1 hover:text-white transition-colors"
                  title="Cambiar playlist"
                >
                  <Music className="w-3 h-3" />
                  <span>{currentPlaylist.name}</span>
                </button>
                <span>•</span>
                <span>{currentTrackIndex + 1}/{currentPlaylist.tracks?.length || 0}</span>
              </div>
              <button
                onClick={() => setShowTrackList(!showTrackList)}
                className="hover:text-white transition-colors"
                title="Ver tracklist"
              >
                <List className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Volume Control */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Volume2 className="w-4 h-4 text-gray-400" />
              <span className="text-xs text-gray-400">{Math.round(volume * 100)}%</span>
            </div>
            <div className="relative">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={(e) => {
                  const newVolume = parseFloat(e.target.value);
                  setVolume(newVolume);
                  if (audioRef.current) {
                    audioRef.current.volume = newVolume;
                  }
                }}
                className="volume-slider w-full h-2 bg-gray-700 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${volume * 100}%, #374151 ${volume * 100}%, #374151 100%)`
                }}
              />
            </div>
          </div>

          {/* Platform Buttons - Responsive Grid */}
          <PlatformButtons
            handleSpotify={handleSpotify}
            handleYouTubeMusic={handleYouTubeMusic}
            handleAppleMusic={handleAppleMusic}
            handleLocalPlayer={handleLocalPlayer}
          />

          {/* Playlist Selector */}
          {showPlaylistSelector && currentPlatform === 'local' && (
            <PlaylistSelector
              playlists={playlists}
              currentPlaylist={currentPlaylist}
              onSelectPlaylist={(playlist) => {
                selectAndPlayPlaylist(playlist);
                setShowPlaylistSelector(false);
              }}
            />
          )}

          {/* Track List */}
          {showTrackList && currentPlaylist && currentPlaylist.tracks && (
            <TrackList
              currentPlaylist={currentPlaylist}
              currentTrackIndex={currentTrackIndex}
              playTrackAtIndex={playTrackAtIndex}
              removeTrackFromPlaylist={removeTrackFromPlaylist}
              onClose={() => setShowTrackList(false)}
            />
          )}

          {/* Exercise Sync Status */}
          {currentExercise && musicConfig?.general?.autoSync && (
            <div className="p-3 bg-gradient-to-r from-yellow-400/10 to-orange-500/10 border border-yellow-400/30 rounded-xl">
              <div className="text-xs text-yellow-400 font-medium mb-1">
                🎵 Sincronizado con: {currentExercise.name}
              </div>
              <div className="text-xs text-gray-400">
                {currentExercise.type} • {currentExercise.intensity}
              </div>
            </div>
          )}

          {/* Playlist Management for Local Files */}
          {showPlaylistManager && (
            <PlaylistManager
              onClose={() => setShowPlaylistManager(false)}
              creatingPlaylist={creatingPlaylist}
              newPlaylistName={newPlaylistName}
              setNewPlaylistName={setNewPlaylistName}
              tempTracks={tempTracks}
              clearAllTempTracks={clearAllTempTracks}
              removeFromTemp={removeFromTemp}
              cancelCreatingPlaylist={cancelCreatingPlaylist}
              confirmCreatePlaylist={confirmCreatePlaylist}
              startCreatingPlaylist={startCreatingPlaylist}
              playlists={playlists}
              editingPlaylist={editingPlaylist}
              setEditingPlaylist={setEditingPlaylist}
              updatePlaylistName={updatePlaylistName}
              deletePlaylist={deletePlaylist}
              selectAndPlayPlaylist={selectAndPlayPlaylist}
            />
          )}
          </div>
          </>
        </div>
      )}

      {/* Hidden file inputs */}
      <input
        id="local-file-input"
        type="file"
        accept="audio/*"
        multiple
        onChange={handleLocalFile}
        className="hidden"
      />
      
      <input
        id="temp-file-input"
        type="file"
        accept="audio/*"
        multiple
        onChange={handleTempFiles}
        className="hidden"
      />

      {/* Hidden audio element for local playback */}
      <audio
        ref={audioRef}
        onLoadedData={() => setCurrentTrack(prev => ({ ...prev, loaded: true }))}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />

      {/* Spotify Web Playback SDK */}
      {currentPlatform === 'spotify' && (
        <script src="https://sdk.scdn.co/spotify-player.js" async />
      )}
    </>
  );
};

export default memo(AudioBubble);
