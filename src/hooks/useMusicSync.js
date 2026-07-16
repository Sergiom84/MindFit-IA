import { useState, useEffect, useCallback } from 'react';

// El backend de Música exige JWT y deriva el usuario del token (no del :userId
// de la URL). Sin esta cabecera, todas las llamadas devuelven 401.
const authHeaders = (extra = {}) => {
  const token = localStorage.getItem('authToken') || localStorage.getItem('token');
  return token ? { ...extra, Authorization: `Bearer ${token}` } : { ...extra };
};

export const useMusicSync = (userId, exerciseData = null) => {
  const [musicConfig, setMusicConfig] = useState(null);
  const [currentRecommendations, setCurrentRecommendations] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Define callback functions FIRST
  const loadMusicConfig = useCallback(async () => {
    try {
      const response = await fetch(`/api/music/config/${userId}`, {
        headers: authHeaders()
      });
      if (response.ok) {
        const config = await response.json();
        setMusicConfig(config);
      }
    } catch (error) {
      console.error('Error loading music config:', error);
      setError('Failed to load music configuration');
    }
  }, [userId]);

  const getExerciseRecommendations = useCallback(async () => {
    if (!exerciseData || !userId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/music/recommendations', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          exerciseType: exerciseData.type,
          intensity: exerciseData.intensity,
          duration: exerciseData.duration
        })
      });

      if (response.ok) {
        const recommendations = await response.json();
        setCurrentRecommendations(recommendations);
      } else {
        throw new Error('Failed to get recommendations');
      }
    } catch (error) {
      console.error('Error getting exercise recommendations:', error);
      setError('Failed to get music recommendations');
    } finally {
      setIsLoading(false);
    }
  }, [exerciseData, userId]);

  // Load music configuration
  useEffect(() => {
    if (userId) {
      loadMusicConfig();
    } else {
      // Set default config if no userId
      setMusicConfig({
        spotify: { enabled: false, connected: false },
        youtube: { enabled: false, connected: false },
        apple: { enabled: false, connected: false },
        local: { enabled: true, supportedFormats: ['mp3', 'wav', 'ogg', 'aac'], autoPlay: false },
        general: { autoSync: false, exerciseBPMSync: true, defaultVolume: 0.8, crossfadeDuration: 3, autoNext: true }
      });
    }
  }, [userId, loadMusicConfig]);

  // Get exercise-based recommendations when exercise changes
  useEffect(() => {
    if (exerciseData && musicConfig?.general?.autoSync) {
      getExerciseRecommendations();
    }
  }, [exerciseData, musicConfig?.general?.autoSync, getExerciseRecommendations]);

  const getOptimalBPM = useCallback((exerciseType, intensity) => {
    const exerciseTypeNormalized = exerciseType?.toLowerCase();
    const intensityNormalized = intensity?.toLowerCase();
    
    let baseBPM = 120;
    let range = 20;
    
    switch (exerciseTypeNormalized) {
      case 'cardio':
      case 'hiit':
        baseBPM = intensityNormalized === 'high' ? 150 : 
                  intensityNormalized === 'medium' ? 135 : 120;
        range = 15;
        break;
        
      case 'strength':
      case 'powerlifting':
        baseBPM = intensityNormalized === 'high' ? 120 : 
                  intensityNormalized === 'medium' ? 110 : 100;
        range = 20;
        break;
        
      case 'yoga':
      case 'stretching':
        baseBPM = 75;
        range = 15;
        break;
        
      case 'functional':
        baseBPM = intensityNormalized === 'high' ? 130 : 
                  intensityNormalized === 'medium' ? 120 : 110;
        range = 20;
        break;
        
      default:
        baseBPM = 120;
        range = 30;
    }
    
    return {
      target: baseBPM,
      min: baseBPM - range,
      max: baseBPM + range
    };
  }, []);

  const getRecommendedGenres = useCallback((exerciseType, intensity) => {
    const exerciseTypeNormalized = exerciseType?.toLowerCase();
    const intensityNormalized = intensity?.toLowerCase();
    
    switch (exerciseTypeNormalized) {
      case 'cardio':
      case 'hiit':
        return intensityNormalized === 'high' 
          ? ['electronic', 'dance', 'house', 'techno']
          : ['pop', 'electronic', 'dance'];
          
      case 'strength':
      case 'powerlifting':
        return intensityNormalized === 'high'
          ? ['metal', 'rock', 'hardcore', 'rap']
          : ['rock', 'alternative', 'hip-hop'];
          
      case 'yoga':
      case 'stretching':
        return ['ambient', 'new-age', 'classical', 'chill'];
        
      case 'functional':
        return ['pop', 'rock', 'electronic', 'indie'];
        
      default:
        return ['pop', 'rock', 'electronic'];
    }
  }, []);

  const getEnergyLevel = useCallback((exerciseType, intensity) => {
    const exerciseTypeNormalized = exerciseType?.toLowerCase();
    const intensityNormalized = intensity?.toLowerCase();
    
    let baseEnergy = 0.7;
    
    switch (exerciseTypeNormalized) {
      case 'cardio':
      case 'hiit':
        baseEnergy = intensityNormalized === 'high' ? 0.9 : 
                     intensityNormalized === 'medium' ? 0.8 : 0.7;
        break;
        
      case 'strength':
      case 'powerlifting':
        baseEnergy = intensityNormalized === 'high' ? 0.9 : 
                     intensityNormalized === 'medium' ? 0.7 : 0.6;
        break;
        
      case 'yoga':
      case 'stretching':
        baseEnergy = 0.3;
        break;
        
      case 'functional':
        baseEnergy = intensityNormalized === 'high' ? 0.8 : 
                     intensityNormalized === 'medium' ? 0.7 : 0.6;
        break;
        
      default:
        baseEnergy = 0.7;
    }
    
    return Math.max(0.1, Math.min(1.0, baseEnergy));
  }, []);

  const getValenceLevel = useCallback((exerciseType) => {
    const exerciseTypeNormalized = exerciseType?.toLowerCase();
    
    switch (exerciseTypeNormalized) {
      case 'cardio':
      case 'hiit':
        return 0.8; // Happy, energetic
        
      case 'strength':
      case 'powerlifting':
        return 0.6; // Focused, determined
        
      case 'yoga':
      case 'stretching':
        return 0.7; // Peaceful, positive
        
      case 'functional':
        return 0.7; // Balanced energy
        
      default:
        return 0.6; // Neutral
    }
  }, []);

  const getMusicParameters = useCallback((exerciseType, intensity) => {
    return {
      bpm: getOptimalBPM(exerciseType, intensity),
      genres: getRecommendedGenres(exerciseType, intensity),
      energy: getEnergyLevel(exerciseType, intensity),
      valence: getValenceLevel(exerciseType)
    };
  }, [getOptimalBPM, getRecommendedGenres, getEnergyLevel, getValenceLevel]);

  const updateMusicConfig = async (newConfig) => {
    try {
      const response = await fetch(`/api/music/config/${userId}`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(newConfig)
      });

      if (response.ok) {
        const result = await response.json();
        setMusicConfig(result.config);
        return true;
      } else {
        throw new Error('Failed to update config');
      }
    } catch (error) {
      console.error('Error updating music config:', error);
      setError('Failed to update music configuration');
      return false;
    }
  };

  const refreshSpotifyToken = async () => {
    if (!musicConfig?.spotify?.refreshToken) return false;

    try {
      const response = await fetch('/api/music/spotify/refresh-token', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          refreshToken: musicConfig.spotify.refreshToken
        })
      });

      if (response.ok) {
        const result = await response.json();
        setMusicConfig(prev => ({
          ...prev,
          spotify: {
            ...prev.spotify,
            accessToken: result.accessToken
          }
        }));
        return true;
      }
    } catch (error) {
      console.error('Error refreshing Spotify token:', error);
    }
    
    return false;
  };

  const testPlatformConnection = async (platform) => {
    try {
      const response = await fetch('/api/music/test-connection', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          platform,
          config: musicConfig[platform]
        })
      });

      if (response.ok) {
        const result = await response.json();
        
        // Update connection status in config
        setMusicConfig(prev => ({
          ...prev,
          [platform]: {
            ...prev[platform],
            connected: result.success
          }
        }));
        
        return result.success;
      }
    } catch (error) {
      console.error(`Error testing ${platform} connection:`, error);
    }
    
    return false;
  };

  const getSyncStatus = useCallback(() => {
    if (!musicConfig || !exerciseData) {
      return {
        isEnabled: false,
        reason: 'No music config or exercise data'
      };
    }

    if (!musicConfig.general?.autoSync) {
      return {
        isEnabled: false,
        reason: 'Auto-sync is disabled'
      };
    }

    const enabledPlatforms = Object.entries(musicConfig)
      .filter(([key, config]) => 
        key !== 'general' && 
        config.enabled && 
        config.connected
      );

    if (enabledPlatforms.length === 0) {
      return {
        isEnabled: false,
        reason: 'No platforms connected'
      };
    }

    return {
      isEnabled: true,
      platforms: enabledPlatforms.map(([key]) => key),
      parameters: getMusicParameters(exerciseData.type, exerciseData.intensity)
    };
  }, [musicConfig, exerciseData, getMusicParameters]);

  return {
    musicConfig,
    currentRecommendations,
    isLoading,
    error,
    loadMusicConfig,
    updateMusicConfig,
    getExerciseRecommendations,
    getMusicParameters,
    refreshSpotifyToken,
    testPlatformConnection,
    getSyncStatus
  };
};