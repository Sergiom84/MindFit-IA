import { useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff, User, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ErrorPopup from '../ui/ErrorPopup';
import { useFormValidation } from '../../hooks/useFormValidation';
import { useAuth } from '../../hooks/useAuth';

const LoginPage = () => {
  const navigate = useNavigate();
  const { login, isLoading } = useAuth();

  const {
    formData,
    errors,
    handleInputChange,
    validateForm,
    setErrors
  } = useFormValidation({
    email: '',
    password: ''
  });

  const [showPassword, setShowPassword] = useState(false);
  const [errorPopup, setErrorPopup] = useState({ show: false, message: '', title: '' });

  const handleSubmit = async (e) => {
    e.preventDefault();

    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const result = await login({
      email: formData.email,
      password: formData.password
    });

    if (!result.success) {
      setErrorPopup({
        show: true,
        title: result.error.includes('servidor') ? 'Error de conexión' : 'Error de autenticación',
        message: result.error
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#050506] text-white relative overflow-hidden font-body">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[url('/assets/tech-lux/bg-tech-lux-mobile.jpg')] sm:bg-[url('/assets/tech-lux/bg-tech-lux-desktop.jpg')] bg-cover bg-center opacity-80 sm:opacity-70" />
        <div className="absolute inset-0 bg-[url('/assets/tech-lux/texture-tech-lux-tile.jpg')] bg-repeat opacity-20 mix-blend-soft-light" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/40 to-black/80 sm:from-black/40 sm:via-black/60 sm:to-black" />
        <div className="absolute -top-20 right-0 h-56 w-56 bg-yellow-400/10 blur-[140px]" />
        <div className="absolute top-1/3 -left-16 h-64 w-64 bg-yellow-400/10 blur-[160px]" />
      </div>
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md"
        >
          {/* Header con pestañas */}
          <div className="mb-8">
            <div className="flex rounded-2xl overflow-hidden border border-white/10 bg-white/5 backdrop-blur">
              <button className="flex-1 bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black py-3 px-6 font-semibold flex items-center justify-center gap-2 transition-colors">
                <User size={18} />
                Iniciar Sesión
              </button>
              <button
                onClick={() => navigate('/register')}
                className="flex-1 bg-transparent text-gray-200 py-3 px-6 font-semibold hover:bg-white/10 transition-colors"
              >
                Registrarse
              </button>
            </div>
          </div>

          {/* Formulario de Login */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg rounded-2xl p-6 sm:p-8"
          >
            <div className="text-center mb-8">
              <h2 className="text-2xl font-semibold font-urbanist text-white mb-2">Iniciar Sesión</h2>
              <p className="text-gray-300/80">Accede a tu cuenta Entrena con IA</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Email */}
              <div>
                <label className="block text-gray-200 font-semibold mb-2">Email</label>
                <div className="relative">
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="tu@email.com"
                    autoComplete="email"
                    className={`w-full bg-white/5 border ${
                      errors.email ? 'border-red-500' : 'border-white/10'
                    } rounded-lg px-4 py-3 text-gray-100 placeholder-gray-400 focus:outline-none focus:border-yellow-400/60 transition-colors`}
                  />
                  {errors.email && (
                    <p className="text-red-400 text-sm mt-1">{errors.email}</p>
                  )}
                </div>
              </div>

              {/* Contraseña */}
              <div>
                <label className="block text-gray-200 font-semibold mb-2">Contraseña</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    placeholder="Tu contraseña"
                    autoComplete="current-password"
                    className={`w-full bg-white/5 border ${
                      errors.password ? 'border-red-500' : 'border-white/10'
                    } rounded-lg px-4 py-3 pr-12 text-gray-100 placeholder-gray-400 focus:outline-none focus:border-yellow-400/60 transition-colors`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-300 hover:text-yellow-300 transition-colors"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                  {errors.password && (
                    <p className="text-red-400 text-sm mt-1">{errors.password}</p>
                  )}
                </div>
              </div>

              {/* Botón de Login */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400 font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-[0_12px_30px_-18px_rgba(250,204,21,0.8)]"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-[#0b1220] border-t-transparent"></div>
                    Iniciando...
                  </>
                ) : (
                  <>
                    <Lock size={18} />
                    Iniciar Sesión
                  </>
                )}
              </button>
            </form>

            {/* Footer */}
            <div className="text-center mt-6">
              <p className="text-gray-300/80">
                ¿No tienes cuenta?{' '}
                <button
                  onClick={() => navigate('/register')}
                  className="text-yellow-300 hover:text-yellow-200 font-semibold transition-colors"
                >
                  Crear cuenta
                </button>
              </p>
            </div>
          </motion.div>
        </motion.div>

        {/* Popup de Error */}
        <ErrorPopup
          show={errorPopup.show}
          title={errorPopup.title}
          message={errorPopup.message}
          onClose={() => setErrorPopup({ show: false, message: '', title: '' })}
        />
      </div>
    </div>
  );
};

export default LoginPage;
