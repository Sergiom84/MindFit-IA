import { motion } from 'framer-motion';
import { LogOut, User, Home, Dumbbell, UserCircle, BookOpen, Calendar, Apple, Shield, Droplet } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { memo, useCallback, useMemo, useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

const Navigation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, logout } = useAuth();
  const [showCycleTab, setShowCycleTab] = useState(false);

  // Verificar si el usuario es femenino y debe ver la pestaña de ciclo
  useEffect(() => {
    const checkCycleFeature = async () => {
      if (!isAuthenticated) return;
      
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/menstrual-cycle/check-user', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
          const data = await response.json();
          setShowCycleTab(data.showCycleFeature === true);
        }
      } catch (err) {
        console.error('Error verificando feature de ciclo:', err);
      }
    };

    checkCycleFeature();
  }, [isAuthenticated, user?.id]);

  // Verificar si hay rutinas disponibles (memoizado)
  const hasRoutines = useMemo(() => 
    localStorage.getItem('currentRoutinePlan'), 
    []
  );

  // Helper para determinar si un botón está activo (memoizado)
  const isActive = useCallback((path) => 
    location.pathname === path, 
    [location.pathname]
  );

  const handleLogout = useCallback(() => {
    if (confirm('¿Estás seguro de que quieres cerrar sesión?')) {
      logout();
    }
  }, [logout]);

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
        className="bg-black border-b border-yellow-400/20 sticky top-0 z-50"
      >
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div 
              onClick={() => navigate('/')}
              className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
            >
              <div className="bg-yellow-400 p-2 rounded-lg">
                <Dumbbell size={24} className="text-black" />
              </div>
              <h1 className="text-xl font-bold text-white">MindFit</h1>
            </div>

            {/* Profile Sphere */}
            <div className="flex items-center gap-3">
              <div 
                onClick={() => navigate('/profile')}
                className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
              >
                {/* Profile Picture Sphere */}
                <div className="relative">
                  <div className="w-10 h-10 bg-gradient-to-r from-yellow-400 to-yellow-500 rounded-full flex items-center justify-center border-2 border-yellow-400/30 hover:border-yellow-400/60 transition-colors">
                    {user?.profile_picture ? (
                      <img 
                        src={user.profile_picture} 
                        alt="Profile" 
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      <User size={20} className="text-black" />
                    )}
                  </div>
                </div>
                
                {/* User Name */}
                <div className="hidden sm:block">
                  <span className="text-white font-medium text-sm">
                    {user?.nombre}
                  </span>
                </div>
              </div>

              {/* Logout Button - Smaller and more discrete */}
              <button
                onClick={handleLogout}
                className="ml-2 p-2 text-gray-400 hover:text-red-400 transition-colors"
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
        className="fixed bottom-0 left-0 right-0 bg-black border-t border-yellow-400/20 z-50"
      >
        <div className="flex justify-around items-center py-2">
          <button
            onClick={() => navigate('/')}
            className={`flex flex-col items-center gap-1 py-2 px-2 transition-colors ${
              isActive('/') 
                ? 'text-yellow-400' 
                : 'text-gray-300 hover:text-yellow-400'
            }`}
          >
            <Home size={22} />
            <span className="text-xs font-medium">Inicio</span>
          </button>
          <button
            onClick={() => navigate('/methodologies')}
            className={`flex flex-col items-center gap-1 py-2 px-2 transition-colors ${
              isActive('/methodologies')
                ? 'text-yellow-400'
                : 'text-gray-300 hover:text-yellow-400'
            }`}
          >
            <BookOpen size={22} />
            <span className="text-xs font-medium">Métodos</span>
          </button>
          <button
            onClick={() => navigate('/oposiciones')}
            className={`flex flex-col items-center gap-1 py-2 px-2 transition-colors ${
              isActive('/oposiciones')
                ? 'text-yellow-400'
                : 'text-gray-300 hover:text-yellow-400'
            }`}
          >
            <Shield size={22} />
            <span className="text-xs font-medium">Oposiciones</span>
          </button>
          <button
            onClick={() => navigate('/routines')}
            className={`flex flex-col items-center gap-1 py-2 px-2 transition-colors relative ${
              isActive('/routines')
                ? 'text-yellow-400'
                : 'text-gray-300 hover:text-yellow-400'
            }`}
          >
            <Calendar size={22} />
            <span className="text-xs font-medium">Rutinas</span>
            {hasRoutines && (
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full"></div>
            )}
          </button>
          <button
            onClick={() => navigate('/nutrition')}
            className={`flex flex-col items-center gap-1 py-2 px-2 transition-colors ${
              isActive('/nutrition') 
                ? 'text-yellow-400' 
                : 'text-gray-300 hover:text-yellow-400'
            }`}
          >
            <Apple size={22} />
            <span className="text-xs font-medium">Nutrición</span>
          </button>
          {showCycleTab && (
            <button
              onClick={() => navigate('/cycle')}
              className={`flex flex-col items-center gap-1 py-2 px-2 transition-colors ${
                isActive('/cycle') 
                  ? 'text-pink-400' 
                  : 'text-gray-300 hover:text-pink-400'
              }`}
            >
              <Droplet size={22} />
              <span className="text-xs font-medium">Ciclo</span>
            </button>
          )}
          <button
            onClick={() => navigate('/profile')}
            className={`flex flex-col items-center gap-1 py-2 px-2 transition-colors ${
              isActive('/profile') 
                ? 'text-yellow-400' 
                : 'text-gray-300 hover:text-yellow-400'
            }`}
          >
            <UserCircle size={22} />
            <span className="text-xs font-medium">Perfil</span>
          </button>
        </div>
      </motion.nav>
    </>
  );
};

export default memo(Navigation);
