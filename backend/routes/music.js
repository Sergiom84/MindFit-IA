import express from 'express';
import { pool } from '../db.js';
import authenticateToken from '../middleware/auth.js';

const router = express.Router();

// 🛡️ Todos los endpoints requieren autenticación. El usuario SIEMPRE se toma
// del token (req.user.id); nunca de un parámetro de ruta o del body → evita
// IDOR (acceso/escritura sobre config, playlists y tokens OAuth de otros
// usuarios usando IDs arbitrarios).
router.use(authenticateToken);

const getUserId = (req) => req.user?.id || req.user?.userId;

// Get user music configuration
router.get('/config/:userId', async (req, res) => {
  try {
    const userId = getUserId(req);

    const query = `
      SELECT music_config 
      FROM app.user_profiles 
      WHERE user_id = $1
    `;
    
    const result = await pool.query(query, [userId]);

    // Usuarios recién registrados aún no tienen fila en user_profiles: devolver
    // la configuración por defecto en lugar de 404 (evita ruido en cada sesión).
    const musicConfig = result.rows[0]?.music_config || {
      spotify: { enabled: false, connected: false },
      youtube: { enabled: false, connected: false },
      apple: { enabled: false, connected: false },
      local: { enabled: true, supportedFormats: ['mp3', 'wav', 'ogg', 'aac'], autoPlay: false },
      general: { autoSync: false, exerciseBPMSync: true, defaultVolume: 0.8, crossfadeDuration: 3, autoNext: true }
    };
    
    res.json(musicConfig);
  } catch (error) {
    console.error('Error fetching music config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user music configuration
router.put('/config/:userId', async (req, res) => {
  try {
    const userId = getUserId(req);
    const musicConfig = req.body;
    
    const query = `
      UPDATE app.user_profiles 
      SET music_config = $1, updated_at = NOW()
      WHERE user_id = $2
      RETURNING music_config
    `;
    
    const result = await pool.query(query, [JSON.stringify(musicConfig), userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ success: true, config: result.rows[0].music_config });
  } catch (error) {
    console.error('Error updating music config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Test connection to music platforms
router.post('/test-connection', async (req, res) => {
  try {
    const { platform, config } = req.body;
    
    let success = false;
    let message = '';
    
    switch (platform) {
      case 'spotify':
        success = await testSpotifyConnection(config);
        message = success ? 'Spotify connection successful' : 'Failed to connect to Spotify';
        break;
        
      case 'youtube':
        success = await testYouTubeConnection(config);
        message = success ? 'YouTube Music connection successful' : 'Failed to connect to YouTube Music';
        break;
        
      case 'apple':
        success = await testAppleMusicConnection(config);
        message = success ? 'Apple Music connection successful' : 'Failed to connect to Apple Music';
        break;
        
      default:
        return res.status(400).json({ error: 'Invalid platform' });
    }
    
    res.json({ success, message });
  } catch (error) {
    console.error('Error testing connection:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Spotify OAuth callback
router.post('/spotify/callback', async (req, res) => {
  try {
    const { code } = req.body;
    const userId = getUserId(req);

    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${process.env.FRONTEND_URL}/spotify-callback`
      })
    });
    
    const tokenData = await tokenResponse.json();
    
    if (tokenData.access_token) {
      // Update user's Spotify configuration
      const query = `
        UPDATE app.user_profiles 
        SET music_config = jsonb_set(
          COALESCE(music_config, '{}'),
          '{spotify}',
          jsonb_build_object(
            'enabled', true,
            'connected', true,
            'accessToken', $1,
            'refreshToken', $2,
            'expiresAt', $3
          )
        )
        WHERE user_id = $4
      `;
      
      const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));
      await pool.query(query, [
        tokenData.access_token,
        tokenData.refresh_token,
        expiresAt,
        userId
      ]);
      
      res.json({ success: true, message: 'Spotify connected successfully' });
    } else {
      res.status(400).json({ error: 'Failed to get access token' });
    }
  } catch (error) {
    console.error('Error handling Spotify callback:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get exercise-based music recommendations
router.post('/recommendations', async (req, res) => {
  try {
    const { exerciseType, intensity, duration } = req.body;
    const userId = getUserId(req);

    // Get user's music config
    const configQuery = `
      SELECT music_config 
      FROM app.user_profiles 
      WHERE user_id = $1
    `;
    
    const configResult = await pool.query(configQuery, [userId]);
    const musicConfig = configResult.rows[0]?.music_config || {};
    
    // Generate exercise-based recommendations
    const recommendations = generateExerciseRecommendations(exerciseType, intensity, duration);
    
    // Get recommendations from enabled platforms
    const platformRecommendations = {};
    
    if (musicConfig.spotify?.enabled && musicConfig.spotify?.accessToken) {
      platformRecommendations.spotify = await getSpotifyRecommendations(
        recommendations,
        musicConfig.spotify.accessToken
      );
    }
    
    if (musicConfig.youtube?.enabled && musicConfig.youtube?.apiKey) {
      platformRecommendations.youtube = await getYouTubeRecommendations(
        recommendations,
        musicConfig.youtube.apiKey
      );
    }
    
    res.json({
      exerciseParams: recommendations,
      recommendations: platformRecommendations
    });
  } catch (error) {
    console.error('Error getting music recommendations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Utility functions
async function testSpotifyConnection(config) {
  try {
    if (!config.accessToken) return false;
    
    const response = await fetch('https://api.spotify.com/v1/me', {
      headers: {
        'Authorization': `Bearer ${config.accessToken}`
      }
    });
    
    return response.ok;
  } catch (error) {
    console.error('Spotify connection test failed:', error);
    return false;
  }
}

async function testYouTubeConnection(config) {
  try {
    if (!config.apiKey) return false;
    
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=test&type=video&key=${config.apiKey}&maxResults=1`
    );
    
    return response.ok;
  } catch (error) {
    console.error('YouTube connection test failed:', error);
    return false;
  }
}

async function testAppleMusicConnection(config) {
  try {
    if (!config.developerToken) return false;
    
    const response = await fetch('https://api.music.apple.com/v1/catalog/us/songs?ids=1441164670', {
      headers: {
        'Authorization': `Bearer ${config.developerToken}`
      }
    });
    
    return response.ok;
  } catch (error) {
    console.error('Apple Music connection test failed:', error);
    return false;
  }
}

function generateExerciseRecommendations(exerciseType, intensity, duration) {
  let bpm = 120;
  let genres = ['workout'];
  let energy = 0.7;
  let valence = 0.6;
  
  switch (exerciseType?.toLowerCase()) {
    case 'cardio':
    case 'hiit':
      bpm = intensity === 'high' ? 150 : intensity === 'medium' ? 135 : 120;
      genres = ['electronic', 'dance', 'pop', 'house'];
      energy = intensity === 'high' ? 0.9 : 0.8;
      valence = 0.8;
      break;
      
    case 'strength':
    case 'powerlifting':
      bpm = intensity === 'high' ? 120 : intensity === 'medium' ? 110 : 100;
      genres = ['rock', 'metal', 'hip-hop', 'rap'];
      energy = intensity === 'high' ? 0.9 : 0.7;
      valence = 0.6;
      break;
      
    case 'yoga':
    case 'stretching':
      bpm = 80;
      genres = ['ambient', 'chill', 'classical', 'new-age'];
      energy = 0.3;
      valence = 0.7;
      break;
      
    case 'functional':
      bpm = intensity === 'high' ? 130 : intensity === 'medium' ? 120 : 110;
      genres = ['pop', 'rock', 'electronic', 'indie'];
      energy = intensity === 'high' ? 0.8 : 0.7;
      valence = 0.7;
      break;
      
    default:
      bpm = 120;
      genres = ['workout', 'pop'];
      energy = 0.7;
      valence = 0.6;
  }
  
  return {
    bpm: { min: bpm - 10, max: bpm + 10, target: bpm },
    genres,
    energy,
    valence,
    duration,
    exerciseType,
    intensity
  };
}

async function getSpotifyRecommendations(params, accessToken) {
  try {
    const seedGenres = params.genres.slice(0, 5).join(','); // Spotify limits to 5 seed genres
    
    const queryParams = new URLSearchParams({
      seed_genres: seedGenres,
      target_tempo: params.bpm.target,
      min_tempo: params.bpm.min,
      max_tempo: params.bpm.max,
      target_energy: params.energy,
      target_valence: params.valence,
      limit: 20
    });
    
    const response = await fetch(
      `https://api.spotify.com/v1/recommendations?${queryParams}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`Spotify API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    return data.tracks.map(track => ({
      id: track.id,
      name: track.name,
      artist: track.artists[0].name,
      uri: track.uri,
      preview_url: track.preview_url,
      duration_ms: track.duration_ms,
      external_urls: track.external_urls
    }));
  } catch (error) {
    console.error('Error getting Spotify recommendations:', error);
    return [];
  }
}

async function getYouTubeRecommendations(params, apiKey) {
  try {
    const searchQuery = `${params.exerciseType} workout music ${params.intensity} intensity`;
    
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?` +
      `part=snippet&q=${encodeURIComponent(searchQuery)}&` +
      `type=video&videoCategoryId=10&maxResults=20&key=${apiKey}`
    );
    
    if (!response.ok) {
      throw new Error(`YouTube API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    return data.items.map(item => ({
      id: item.id.videoId,
      name: item.snippet.title,
      artist: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails.medium.url,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`
    }));
  } catch (error) {
    console.error('Error getting YouTube recommendations:', error);
    return [];
  }
}

// Playlist management routes
router.get('/playlists/:userId', async (req, res) => {
  try {
    const userId = getUserId(req);

    const query = `
      SELECT * FROM app.music_playlists
      WHERE user_id = $1 
      ORDER BY created_at DESC
    `;
    
    const result = await pool.query(query, [userId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching playlists:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/playlists/:userId', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { name, tracks } = req.body;
    
    const query = `
      INSERT INTO app.music_playlists (user_id, name, tracks, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      RETURNING *
    `;
    
    const result = await pool.query(query, [userId, name, JSON.stringify(tracks || [])]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating playlist:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/playlists/:playlistId', async (req, res) => {
  try {
    const { playlistId } = req.params;
    const userId = getUserId(req);
    const { name, tracks } = req.body;

    const updates = [];
    const values = [];
    let valueIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${valueIndex++}`);
      values.push(name);
    }

    if (tracks !== undefined) {
      updates.push(`tracks = $${valueIndex++}`);
      values.push(JSON.stringify(tracks));
    }

    updates.push(`updated_at = NOW()`);
    values.push(playlistId);
    values.push(userId);

    const query = `
      UPDATE app.music_playlists
      SET ${updates.join(', ')}
      WHERE id = $${valueIndex} AND user_id = $${valueIndex + 1}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating playlist:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/playlists/:playlistId', async (req, res) => {
  try {
    const { playlistId } = req.params;
    const userId = getUserId(req);

    const query = `
      DELETE FROM app.music_playlists
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `;

    const result = await pool.query(query, [playlistId, userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    
    res.json({ success: true, deleted: result.rows[0] });
  } catch (error) {
    console.error('Error deleting playlist:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add track to playlist
router.post('/playlists/:playlistId/tracks', async (req, res) => {
  try {
    const { playlistId } = req.params;
    const userId = getUserId(req);
    const { track } = req.body;

    // Get current tracks
    const getQuery = `SELECT tracks FROM app.music_playlists WHERE id = $1 AND user_id = $2`;
    const currentResult = await pool.query(getQuery, [playlistId, userId]);

    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    const currentTracks = currentResult.rows[0].tracks || [];
    const updatedTracks = [...currentTracks, { ...track, id: Date.now().toString() }];

    // Update with new tracks
    const updateQuery = `
      UPDATE app.music_playlists
      SET tracks = $1, updated_at = NOW()
      WHERE id = $2 AND user_id = $3
      RETURNING *
    `;

    const result = await pool.query(updateQuery, [JSON.stringify(updatedTracks), playlistId, userId]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding track to playlist:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove track from playlist
router.delete('/playlists/:playlistId/tracks/:trackId', async (req, res) => {
  try {
    const { playlistId, trackId } = req.params;
    const userId = getUserId(req);

    // Get current tracks
    const getQuery = `SELECT tracks FROM app.music_playlists WHERE id = $1 AND user_id = $2`;
    const currentResult = await pool.query(getQuery, [playlistId, userId]);

    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    const currentTracks = currentResult.rows[0].tracks || [];
    const updatedTracks = currentTracks.filter(track => track.id !== trackId);

    // Update with filtered tracks
    const updateQuery = `
      UPDATE app.music_playlists
      SET tracks = $1, updated_at = NOW()
      WHERE id = $2 AND user_id = $3
      RETURNING *
    `;

    const result = await pool.query(updateQuery, [JSON.stringify(updatedTracks), playlistId, userId]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error removing track from playlist:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Refresh Spotify token
router.post('/spotify/refresh-token', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const userId = getUserId(req);

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    });
    
    const tokenData = await response.json();
    
    if (tokenData.access_token) {
      // Update user's access token
      const query = `
        UPDATE app.user_profiles 
        SET music_config = jsonb_set(
          music_config,
          '{spotify,accessToken}',
          to_jsonb($1::text)
        )
        WHERE user_id = $2
      `;
      
      await pool.query(query, [tokenData.access_token, userId]);
      
      res.json({ 
        success: true, 
        accessToken: tokenData.access_token 
      });
    } else {
      res.status(400).json({ error: 'Failed to refresh token' });
    }
  } catch (error) {
    console.error('Error refreshing Spotify token:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;