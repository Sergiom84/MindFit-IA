import React, { useState, useEffect } from 'react';
import { Save, Music, Headphones, Smartphone, Volume2, Settings, ExternalLink, Check, X } from 'lucide-react';
import { FaSpotify, FaYoutube, FaApple } from 'react-icons/fa';
import tokenManager from '../../utils/tokenManager';

const MusicConfigTab = ({ userId }) => {
  // Initialize hooks FIRST - NEVER after conditional returns
  const [config, setConfig] = useState({
    spotify: {
      enabled: false,
      clientId: '',
      clientSecret: '',
      accessToken: '',
      refreshToken: '',
      connected: false
    },
    youtube: {
      enabled: false,
      apiKey: '',
      connected: false
    },
    apple: {
      enabled: false,
      developerToken: '',
      connected: false
    },
    local: {
      enabled: true,
      supportedFormats: ['mp3', 'wav', 'ogg', 'aac'],
      autoPlay: false
    },
    general: {
      autoSync: true,
      exerciseBPMSync: true,
      defaultVolume: 0.8,
      crossfadeDuration: 3,
      autoNext: true
    }
  });
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadMusicConfig();
  }, [userId]);

  const loadMusicConfig = async () => {
    try {
      const response = await fetch(`/api/users/${userId}/music-config`);
      if (response.ok) {
        const data = await response.json();
        setConfig(prev => ({ ...prev, ...data }));
      }
    } catch (error) {
      console.error('Error loading music config:', error);
    }
  };

  const saveMusicConfig = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/users/${userId}/music-config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(config)
      });

      if (response.ok) {
        setMessage('Configuración guardada correctamente');
        setTimeout(() => setMessage(''), 3000);
      } else {
        throw new Error('Error al guardar la configuración');
      }
    } catch (error) {
      setMessage('Error al guardar la configuración');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  const connectSpotify = () => {
    if (!config.spotify.clientId) {
      alert('Ingresa tu Client ID de Spotify primero');
      return;
    }

    const redirectUri = encodeURIComponent(window.location.origin + '/spotify-callback');
    const scopes = encodeURIComponent('streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state playlist-read-private');
    
    const authUrl = `https://accounts.spotify.com/authorize?response_type=code&client_id=${config.spotify.clientId}&scope=${scopes}&redirect_uri=${redirectUri}`;
    window.open(authUrl, '_blank', 'width=600,height=700');
  };

  const testConnection = async (platform) => {
    setLoading(true);
    try {
      const token = tokenManager.getToken() || tokenManager.getToken();
      const response = await fetch(`/api/music/test-connection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          platform,
          config: config[platform]
        })
      });

      const result = await response.json();
      
      setConfig(prev => ({
        ...prev,
        [platform]: {
          ...prev[platform],
          connected: result.success
        }
      }));

      setMessage(result.success ? `${platform} conectado correctamente` : `Error al conectar con ${platform}`);
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage(`Error al probar conexión con ${platform}`);
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  const updatePlatformConfig = (platform, field, value) => {
    setConfig(prev => ({
      ...prev,
      [platform]: {
        ...prev[platform],
        [field]: value
      }
    }));
  };

  const updateGeneralConfig = (field, value) => {
    setConfig(prev => ({
      ...prev,
      general: {
        ...prev.general,
        [field]: value
      }
    }));
  };

  // Early return if no userId provided - AFTER all hooks
  if (!userId) {
    return (
      <div className="space-y-6">
        <div className="p-4 bg-red-600/10 border border-red-600/20 rounded-lg">
          <p className="text-red-400 text-sm">Error: No se pudo cargar la configuración de música</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold font-urbanist text-white">Configuración de Música</h3>
          <p className="text-sm text-gray-300/70">Conecta tus plataformas de música favoritas</p>
        </div>
        <button
          onClick={saveMusicConfig}
          disabled={loading}
          className="flex items-center space-x-2 px-4 py-2 bg-yellow-400 hover:bg-yellow-500 disabled:bg-white/10 rounded-lg transition-colors"
        >
          <Save className="w-4 h-4 text-gray-900" />
          <span className="text-gray-900 font-medium">
            {loading ? 'Guardando...' : 'Guardar'}
          </span>
        </button>
      </div>

      {/* Message */}
      {message && (
        <div className="p-3 bg-yellow-400/10 border border-yellow-400/20 rounded-lg">
          <p className="text-yellow-400 text-sm">{message}</p>
        </div>
      )}

      {/* Spotify Configuration */}
      <div className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <FaSpotify className="w-6 h-6 text-green-500" />
            <div>
              <h4 className="text-white font-medium">Spotify</h4>
              <p className="text-sm text-gray-300/70">Streaming de música premium</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${config.spotify.connected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-gray-300/70">
              {config.spotify.connected ? 'Conectado' : 'Desconectado'}
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={config.spotify.enabled}
              onChange={(e) => updatePlatformConfig('spotify', 'enabled', e.target.checked)}
              className="rounded border-white/10 bg-white/5"
            />
            <label className="text-white">Habilitar Spotify</label>
          </div>

          {config.spotify.enabled && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Client ID
                  </label>
                  <input
                    type="text"
                    value={config.spotify.clientId}
                    onChange={(e) => updatePlatformConfig('spotify', 'clientId', e.target.value)}
                    placeholder="Tu Spotify Client ID"
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Client Secret
                  </label>
                  <input
                    type="password"
                    value={config.spotify.clientSecret}
                    onChange={(e) => updatePlatformConfig('spotify', 'clientSecret', e.target.value)}
                    placeholder="Tu Spotify Client Secret"
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                  />
                </div>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={connectSpotify}
                  className="flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Conectar con Spotify</span>
                </button>
                <button
                  onClick={() => testConnection('spotify')}
                  disabled={loading}
                  className="flex items-center space-x-2 px-4 py-2 bg-white/5 hover:bg-white/10 disabled:bg-white/10 rounded-lg transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  <span>Probar Conexión</span>
                </button>
              </div>

              <div className="text-xs text-gray-500">
                <p>Para obtener tus credenciales de Spotify:</p>
                <p>1. Ve a <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-green-400 hover:underline">Spotify Developer Dashboard</a></p>
                <p>2. Crea una nueva aplicación</p>
                <p>3. Añade como Redirect URI: <code className="bg-white/10 px-1 rounded">{window.location.origin}/spotify-callback</code></p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* YouTube Music Configuration */}
      <div className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <FaYoutube className="w-6 h-6 text-red-500" />
            <div>
              <h4 className="text-white font-medium">YouTube Music</h4>
              <p className="text-sm text-gray-300/70">Biblioteca de música de YouTube</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${config.youtube.connected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-gray-300/70">
              {config.youtube.connected ? 'Conectado' : 'Desconectado'}
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={config.youtube.enabled}
              onChange={(e) => updatePlatformConfig('youtube', 'enabled', e.target.checked)}
              className="rounded border-white/10 bg-white/5"
            />
            <label className="text-white">Habilitar YouTube Music</label>
          </div>

          {config.youtube.enabled && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  YouTube API Key
                </label>
                <input
                  type="password"
                  value={config.youtube.apiKey}
                  onChange={(e) => updatePlatformConfig('youtube', 'apiKey', e.target.value)}
                  placeholder="Tu YouTube API Key"
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                />
              </div>

              <button
                onClick={() => testConnection('youtube')}
                disabled={loading}
                className="flex items-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-white/10 rounded-lg transition-colors"
              >
                <Settings className="w-4 h-4" />
                <span>Probar Conexión</span>
              </button>

              <div className="text-xs text-gray-500">
                <p>Para obtener tu API Key de YouTube:</p>
                <p>1. Ve a <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-red-400 hover:underline">Google Cloud Console</a></p>
                <p>2. Habilita la YouTube Data API v3</p>
                <p>3. Crea credenciales (API Key)</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Apple Music Configuration */}
      <div className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <FaApple className="w-6 h-6 text-gray-300" />
            <div>
              <h4 className="text-white font-medium">Apple Music</h4>
              <p className="text-sm text-gray-300/70">Servicio de streaming de Apple</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${config.apple.connected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-gray-300/70">
              {config.apple.connected ? 'Conectado' : 'Desconectado'}
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={config.apple.enabled}
              onChange={(e) => updatePlatformConfig('apple', 'enabled', e.target.checked)}
              className="rounded border-white/10 bg-white/5"
            />
            <label className="text-white">Habilitar Apple Music</label>
          </div>

          {config.apple.enabled && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Developer Token
                </label>
                <input
                  type="password"
                  value={config.apple.developerToken}
                  onChange={(e) => updatePlatformConfig('apple', 'developerToken', e.target.value)}
                  placeholder="Tu Apple Music Developer Token"
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                />
              </div>

              <button
                onClick={() => testConnection('apple')}
                disabled={loading}
                className="flex items-center space-x-2 px-4 py-2 bg-white/5 hover:bg-white/10 disabled:bg-white/10 rounded-lg transition-colors"
              >
                <Settings className="w-4 h-4" />
                <span>Probar Conexión</span>
              </button>

              <div className="text-xs text-gray-500">
                <p>Para obtener tu Developer Token:</p>
                <p>1. Únete al <a href="https://developer.apple.com/programs/" target="_blank" rel="noopener noreferrer" className="text-gray-300/70 hover:underline">Apple Developer Program</a></p>
                <p>2. Genera un Developer Token en MusicKit</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Local Player Configuration */}
      <div className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Music className="w-6 h-6 text-blue-500" />
            <div>
              <h4 className="text-white font-medium">Reproductor Local</h4>
              <p className="text-sm text-gray-300/70">Reproduce archivos de música locales</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm text-gray-300/70">Siempre disponible</span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={config.local.enabled}
              onChange={(e) => updatePlatformConfig('local', 'enabled', e.target.checked)}
              className="rounded border-white/10 bg-white/5"
            />
            <label className="text-white">Habilitar reproductor local</label>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={config.local.autoPlay}
              onChange={(e) => updatePlatformConfig('local', 'autoPlay', e.target.checked)}
              className="rounded border-white/10 bg-white/5"
            />
            <label className="text-white">Reproducir automáticamente al cargar archivo</label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Formatos soportados
            </label>
            <div className="flex flex-wrap gap-2">
              {['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac'].map(format => (
                <div key={format} className="flex items-center space-x-1">
                  <input
                    type="checkbox"
                    checked={config.local.supportedFormats.includes(format)}
                    onChange={(e) => {
                      const formats = e.target.checked
                        ? [...config.local.supportedFormats, format]
                        : config.local.supportedFormats.filter(f => f !== format);
                      updatePlatformConfig('local', 'supportedFormats', formats);
                    }}
                    className="rounded border-white/10 bg-white/5"
                  />
                  <label className="text-sm text-gray-300">{format.toUpperCase()}</label>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* General Settings */}
      <div className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 rounded-lg p-6">
        <div className="flex items-center space-x-3 mb-4">
          <Settings className="w-6 h-6 text-purple-500" />
          <div>
            <h4 className="text-white font-medium">Configuración General</h4>
            <p className="text-sm text-gray-300/70">Ajustes generales de reproducción</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={config.general.autoSync}
              onChange={(e) => updateGeneralConfig('autoSync', e.target.checked)}
              className="rounded border-white/10 bg-white/5"
            />
            <label className="text-white">Sincronizar automáticamente con ejercicios</label>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={config.general.exerciseBPMSync}
              onChange={(e) => updateGeneralConfig('exerciseBPMSync', e.target.checked)}
              className="rounded border-white/10 bg-white/5"
            />
            <label className="text-white">Adaptar BPM según tipo de ejercicio</label>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={config.general.autoNext}
              onChange={(e) => updateGeneralConfig('autoNext', e.target.checked)}
              className="rounded border-white/10 bg-white/5"
            />
            <label className="text-white">Siguiente canción automática</label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Volumen por defecto: {Math.round(config.general.defaultVolume * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={config.general.defaultVolume}
              onChange={(e) => updateGeneralConfig('defaultVolume', parseFloat(e.target.value))}
              className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Duración de crossfade: {config.general.crossfadeDuration}s
            </label>
            <input
              type="range"
              min="0"
              max="10"
              step="1"
              value={config.general.crossfadeDuration}
              onChange={(e) => updateGeneralConfig('crossfadeDuration', parseInt(e.target.value))}
              className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Exercise-Music Sync Info */}
      <div className="bg-gradient-to-r from-yellow-400/10 to-purple-500/10 border border-yellow-400/20 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <Headphones className="w-5 h-5 text-yellow-400 mt-0.5" />
          <div>
            <h5 className="text-yellow-400 font-medium mb-1">Sincronización Inteligente</h5>
            <p className="text-sm text-gray-300 mb-2">
              La música se adapta automáticamente al tipo de ejercicio:
            </p>
            <ul className="text-xs text-gray-300/70 space-y-1">
              <li>• <strong>Cardio/HIIT:</strong> 140-160 BPM - Electronic, Dance, Pop</li>
              <li>• <strong>Fuerza/Powerlifting:</strong> 100-130 BPM - Rock, Metal, Hip-hop</li>
              <li>• <strong>Yoga/Stretching:</strong> 60-90 BPM - Ambient, Chill, Classical</li>
              <li>• <strong>Funcional:</strong> 110-130 BPM - Pop, Rock, Electronic</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MusicConfigTab;
