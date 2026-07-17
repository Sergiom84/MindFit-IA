import { confirmDialog } from './ui/dialogService.jsx';
import { motion } from 'framer-motion';
import { LogOut, Home, UserCircle, BookOpen, Calendar, Apple, Shield, Droplet, MoreHorizontal } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { memo, useCallback, useMemo, useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import tokenManager from '../utils/tokenManager';

const Navigation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, logout } = useAuth();
  const [showCycleTab, setShowCycleTab] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // Verificar si hay rutinas disponibles (memoizado)
  const hasRoutines = useMemo(() =>
    localStorage.getItem('currentRoutinePlan'),
    []
  );

  // Verificar si el usuario debe ver la pestaña de ciclo menstrual
  useEffect(() => {
    const checkCycleFeature = async () => {
      if (!isAuthenticated) return;

      try {
        const token = tokenManager.getToken() || tokenManager.getToken();
        if (!token) {
          setShowCycleTab(user?.sexo === 'femenino');
          return;
        }
        const response = await fetch('/api/menstrual-cycle/check-user', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          setShowCycleTab(data.showCycleFeature === true);
        } else {
          setShowCycleTab(user?.sexo === 'femenino');
        }
      } catch (err) {
        console.error('Error verificando feature de ciclo:', err);
        setShowCycleTab(user?.sexo === 'femenino');
      }
    };

    checkCycleFeature();
  }, [isAuthenticated, user?.id]);

  // Helper para determinar si un botón está activo (memoizado)
  const isActive = useCallback((path) => 
    location.pathname === path, 
    [location.pathname]
  );

  const handleLogout = useCallback(async () => {
    const ok = await confirmDialog({
      title: 'Cerrar sesión',
      description: '¿Estás seguro de que quieres cerrar sesión?',
      confirmText: 'Cerrar sesión'
    });
    if (ok) {
      logout();
    }
  }, [logout]);

  const isMoreActive = useMemo(() => (
    ['/oposiciones', '/menstrual-cycle', '/profile'].includes(location.pathname)
  ), [location.pathname]);

  const handleNavigate = useCallback((path) => {
    navigate(path);
    setShowMoreMenu(false);
  }, [navigate]);

  if (!isAuthenticated) {
    return null; // No mostrar navegación si no está autenticado
  }

  return (
    <>
      {/* Header con logo y usuario */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="sticky top-0 z-50 bg-neutral-900/70 backdrop-blur-xl border-b border-white/10 ring-1 ring-white/5"
      >
        <div className="container mx-auto px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div 
              onClick={() => navigate('/')}
              className="flex items-center gap-3 cursor-pointer hover:opacity-90 transition-opacity"
            >
              <div className="flex items-center justify-center rounded-xl border border-white/10 bg-white/5 p-1.5 shadow-[0_12px_30px_-20px_rgba(0,0,0,0.8)]">
                <img
                  src="/assets/tech-lux/icon.png"
                  alt="MindFit"
                  className="h-9 w-9 object-contain sm:h-10 sm:w-10 md:h-12 md:w-12"
                />
              </div>
              <h1 className="text-xl font-semibold font-urbanist text-white tracking-wide">MindFit</h1>
            </div>

            {/* Profile Sphere */}
            <div className="flex items-center gap-3">
              <div
                onClick={() => navigate('/profile')}
                className="flex items-center gap-3 cursor-pointer rounded-full bg-white/5 border border-white/10 px-2 py-1.5 hover:bg-white/10 transition-colors"
              >
                {/* Profile Picture Sphere */}
                <div className="relative">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-yellow-400/30 bg-gradient-to-r from-yellow-300 to-amber-500 p-0.5 sm:h-10 sm:w-10 md:h-12 md:w-12">
                    {user?.profile_picture ? (
                      <img
                        src={user.profile_picture}
                        alt="Profile"
                        className="h-full w-full rounded-full object-cover bg-black"
                      />
                    ) : (
                      <img
                        src="/assets/tech-lux/perfil.webp"
                        alt="Perfil"
                        className="h-full w-full rounded-full object-contain bg-black"
                      />
                    )}
                  </div>
                </div>
                
                {/* User Name */}
                <div className="hidden sm:block">
                  <span className="text-gray-100 font-medium text-sm">
                    {user?.nombre}
                  </span>
                </div>
              </div>

              {/* Logout Button - Smaller and more discrete */}
              <button
                onClick={handleLogout}
                className="ml-2 rounded-full border border-white/10 bg-white/5 p-2 text-gray-300 hover:bg-white/10 hover:text-red-300 transition-colors"
                title="Cerrar sesión"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </div>
      </motion.header>

      {/* Navegación inferior fija */}
      <motion.nav
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="fixed bottom-0 left-0 right-0 z-50 sm:px-4 sm:pb-[calc(env(safe-area-inset-bottom)+12px)]"
      >
        <div className="w-full sm:mx-auto sm:max-w-3xl">
          <div className="relative overflow-hidden border-t border-white/10 bg-neutral-900/95 shadow-none backdrop-blur-xl sm:rounded-2xl sm:border sm:bg-neutral-900/80 sm:ring-1 sm:ring-white/5 sm:shadow-[0_25px_70px_-50px_rgba(0,0,0,0.9)]">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-yellow-400/10 via-transparent to-yellow-400/10" />
            <div className="flex items-center justify-between gap-1 px-2 py-2 pb-[calc(env(safe-area-inset-bottom)+8px)] font-body sm:pb-2">
              <button
                onClick={() => navigate('/')}
                className={`group flex flex-shrink-0 flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[11px] font-medium transition-all sm:px-3 sm:py-2 ${
                  isActive('/') 
                    ? 'bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black shadow-[0_12px_30px_-18px_rgba(250,204,21,0.75)]'
                    : 'text-gray-300/80 hover:text-white hover:bg-white/5'
                }`}
              >
                <Home size={20} />
                <span>Inicio</span>
              </button>
              <button
                onClick={() => navigate('/methodologies')}
                className={`group flex flex-shrink-0 flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[11px] font-medium transition-all sm:px-3 sm:py-2 ${
                  isActive('/methodologies')
                    ? 'bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black shadow-[0_12px_30px_-18px_rgba(250,204,21,0.75)]'
                    : 'text-gray-300/80 hover:text-white hover:bg-white/5'
                }`}
              >
                <BookOpen size={20} />
                <span>Métodos</span>
              </button>
              <button
                onClick={() => navigate('/routines')}
                className={`group relative flex flex-shrink-0 flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[11px] font-medium transition-all sm:px-3 sm:py-2 ${
                  isActive('/routines')
                    ? 'bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black shadow-[0_12px_30px_-18px_rgba(250,204,21,0.75)]'
                    : 'text-gray-300/80 hover:text-white hover:bg-white/5'
                }`}
              >
                <Calendar size={20} />
                <span>Rutinas</span>
                {hasRoutines && (
                  <div className="absolute top-1 right-2 h-2 w-2 rounded-full bg-yellow-300" />
                )}
              </button>
              <button
                onClick={() => navigate('/nutrition')}
                className={`group flex flex-shrink-0 flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[11px] font-medium transition-all sm:px-3 sm:py-2 ${
                  isActive('/nutrition')
                    ? 'bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black shadow-[0_12px_30px_-18px_rgba(250,204,21,0.75)]'
                    : 'text-gray-300/80 hover:text-white hover:bg-white/5'
                }`}
              >
                <Apple size={20} />
                <span>Nutrición</span>
              </button>
              <button
                onClick={() => setShowMoreMenu(true)}
                className={`group flex flex-shrink-0 flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[11px] font-medium transition-all sm:px-3 sm:py-2 ${
                  isMoreActive
                    ? 'bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black shadow-[0_12px_30px_-18px_rgba(250,204,21,0.75)]'
                    : 'text-gray-300/80 hover:text-white hover:bg-white/5'
                }`}
              >
                <MoreHorizontal size={20} />
                <span>Más</span>
              </button>
            </div>
          </div>
        </div>
      </motion.nav>
      {showMoreMenu && (
        <div className="fixed inset-0 z-[70]">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowMoreMenu(false)}
          />
          <div className="absolute left-4 right-4 mx-auto max-w-sm rounded-2xl border border-white/10 bg-neutral-900/95 p-4 shadow-2xl ring-1 ring-white/5 backdrop-blur-xl bottom-[calc(env(safe-area-inset-bottom)+96px)]">
            <div className="space-y-2">
              <button
                onClick={() => handleNavigate('/oposiciones')}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-gray-200/90 hover:bg-white/10"
              >
                <Shield size={18} className="text-yellow-300" />
                <span>Oposiciones</span>
              </button>
              {showCycleTab && (
                <button
                  onClick={() => handleNavigate('/menstrual-cycle')}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-gray-200/90 hover:bg-white/10"
                >
                  <Droplet size={18} className="text-yellow-300" />
                  <span>Ciclo</span>
                </button>
              )}
              <button
                onClick={() => handleNavigate('/profile')}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-gray-200/90 hover:bg-white/10"
              >
                <UserCircle size={18} className="text-yellow-300" />
                <span>Perfil</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default memo(Navigation);
