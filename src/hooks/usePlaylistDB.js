import { useState, useEffect, useCallback } from 'react';
import tokenManager from '../utils/tokenManager';

// El backend de Música exige JWT y deriva el usuario del token (no del :userId
// de la URL). Sin esta cabecera, todas las llamadas devuelven 401.
const authHeaders = (extra = {}) => {
  const token = tokenManager.getToken() || tokenManager.getToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : { ...extra };
};

export const usePlaylistDB = (userId) => {
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load playlists from database
  const loadPlaylists = useCallback(async () => {
    if (!userId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/music/playlists/${userId}`, {
        headers: authHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setPlaylists(data);
      } else {
        throw new Error('Failed to load playlists');
      }
    } catch (err) {
      console.error('Error loading playlists:', err);
      setError(err.message);
      
      // Fallback to localStorage if DB fails
      const localPlaylists = localStorage.getItem('audioPlaylists');
      if (localPlaylists) {
        try {
          setPlaylists(JSON.parse(localPlaylists));
        } catch (parseError) {
          console.error('Error parsing local playlists:', parseError);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Create new playlist
  const createPlaylist = useCallback(async (name, tracks = []) => {
    if (!userId) return null;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/music/playlists/${userId}`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name, tracks })
      });
      
      if (response.ok) {
        const newPlaylist = await response.json();
        setPlaylists(prev => [newPlaylist, ...prev]);
        return newPlaylist;
      } else {
        throw new Error('Failed to create playlist');
      }
    } catch (err) {
      console.error('Error creating playlist:', err);
      setError(err.message);
      
      // Fallback to localStorage
      const localPlaylist = {
        id: Date.now().toString(),
        name: name.trim(),
        tracks: tracks || [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      setPlaylists(prev => [localPlaylist, ...prev]);
      
      // Save to localStorage
      const updatedPlaylists = [localPlaylist, ...playlists];
      localStorage.setItem('audioPlaylists', JSON.stringify(updatedPlaylists));
      
      return localPlaylist;
    } finally {
      setLoading(false);
    }
  }, [userId, playlists]);

  // Update playlist
  const updatePlaylist = useCallback(async (playlistId, updates) => {
    if (!userId) return false;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/music/playlists/${playlistId}`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(updates)
      });
      
      if (response.ok) {
        const updatedPlaylist = await response.json();
        setPlaylists(prev => 
          prev.map(playlist => 
            playlist.id === playlistId ? updatedPlaylist : playlist
          )
        );
        return true;
      } else {
        throw new Error('Failed to update playlist');
      }
    } catch (err) {
      console.error('Error updating playlist:', err);
      setError(err.message);
      
      // Fallback to localStorage
      setPlaylists(prev => 
        prev.map(playlist => 
          playlist.id === playlistId 
            ? { ...playlist, ...updates, updated_at: new Date().toISOString() }
            : playlist
        )
      );
      
      // Save to localStorage
      const updatedPlaylists = playlists.map(playlist => 
        playlist.id === playlistId 
          ? { ...playlist, ...updates, updated_at: new Date().toISOString() }
          : playlist
      );
      localStorage.setItem('audioPlaylists', JSON.stringify(updatedPlaylists));
      
      return true;
    } finally {
      setLoading(false);
    }
  }, [userId, playlists]);

  // Delete playlist
  const deletePlaylist = useCallback(async (playlistId) => {
    if (!userId) return false;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/music/playlists/${playlistId}`, {
        method: 'DELETE',
        headers: authHeaders()
      });
      
      if (response.ok) {
        setPlaylists(prev => prev.filter(playlist => playlist.id !== playlistId));
        return true;
      } else {
        throw new Error('Failed to delete playlist');
      }
    } catch (err) {
      console.error('Error deleting playlist:', err);
      setError(err.message);
      
      // Fallback to localStorage
      const filteredPlaylists = playlists.filter(playlist => playlist.id !== playlistId);
      setPlaylists(filteredPlaylists);
      localStorage.setItem('audioPlaylists', JSON.stringify(filteredPlaylists));
      
      return true;
    } finally {
      setLoading(false);
    }
  }, [userId, playlists]);

  // Add track to playlist
  const addTrackToPlaylist = useCallback(async (playlistId, track) => {
    if (!userId) return false;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/music/playlists/${playlistId}/tracks`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ track })
      });
      
      if (response.ok) {
        const updatedPlaylist = await response.json();
        setPlaylists(prev => 
          prev.map(playlist => 
            playlist.id === playlistId ? updatedPlaylist : playlist
          )
        );
        return true;
      } else {
        throw new Error('Failed to add track to playlist');
      }
    } catch (err) {
      console.error('Error adding track to playlist:', err);
      setError(err.message);
      
      // Fallback to localStorage
      const trackWithId = { ...track, id: Date.now().toString() + Math.random().toString(36) };
      setPlaylists(prev => 
        prev.map(playlist => 
          playlist.id === playlistId 
            ? { 
                ...playlist, 
                tracks: [...(playlist.tracks || []), trackWithId],
                updated_at: new Date().toISOString()
              }
            : playlist
        )
      );
      
      // Save to localStorage
      const updatedPlaylists = playlists.map(playlist => 
        playlist.id === playlistId 
          ? { 
              ...playlist, 
              tracks: [...(playlist.tracks || []), trackWithId],
              updated_at: new Date().toISOString()
            }
          : playlist
      );
      localStorage.setItem('audioPlaylists', JSON.stringify(updatedPlaylists));
      
      return true;
    } finally {
      setLoading(false);
    }
  }, [userId, playlists]);

  // Remove track from playlist
  const removeTrackFromPlaylist = useCallback(async (playlistId, trackId) => {
    if (!userId) return false;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/music/playlists/${playlistId}/tracks/${trackId}`, {
        method: 'DELETE',
        headers: authHeaders()
      });
      
      if (response.ok) {
        const updatedPlaylist = await response.json();
        setPlaylists(prev => 
          prev.map(playlist => 
            playlist.id === playlistId ? updatedPlaylist : playlist
          )
        );
        return true;
      } else {
        throw new Error('Failed to remove track from playlist');
      }
    } catch (err) {
      console.error('Error removing track from playlist:', err);
      setError(err.message);
      
      // Fallback to localStorage
      setPlaylists(prev => 
        prev.map(playlist => 
          playlist.id === playlistId 
            ? { 
                ...playlist, 
                tracks: (playlist.tracks || []).filter(track => track.id !== trackId),
                updated_at: new Date().toISOString()
              }
            : playlist
        )
      );
      
      // Save to localStorage
      const updatedPlaylists = playlists.map(playlist => 
        playlist.id === playlistId 
          ? { 
              ...playlist, 
              tracks: (playlist.tracks || []).filter(track => track.id !== trackId),
              updated_at: new Date().toISOString()
            }
          : playlist
      );
      localStorage.setItem('audioPlaylists', JSON.stringify(updatedPlaylists));
      
      return true;
    } finally {
      setLoading(false);
    }
  }, [userId, playlists]);

  // Load playlists on mount and when userId changes
  useEffect(() => {
    if (userId) {
      loadPlaylists();
    }
  }, [userId, loadPlaylists]);

  return {
    playlists,
    loading,
    error,
    loadPlaylists,
    createPlaylist,
    updatePlaylist,
    deletePlaylist,
    addTrackToPlaylist,
    removeTrackFromPlaylist
  };
};