import { memo } from 'react';

// Fondo animado de "Entrenamiento en Casa" (sigue el cursor).
// Extraído de HomeTrainingSection.jsx (ARCH-002) sin cambios visuales.
const HomeTrainingBackground = ({ mousePosition }) => (
  <div className="pointer-events-none absolute inset-0">
    <div className="absolute inset-0 bg-[url('/assets/tech-lux/bg-tech-lux-mobile.jpg')] sm:bg-[url('/assets/tech-lux/bg-tech-lux-desktop.jpg')] bg-cover bg-center opacity-80 sm:opacity-70" />
    <div className="absolute inset-0 bg-[url('/assets/tech-lux/texture-tech-lux-tile.jpg')] bg-repeat opacity-20 mix-blend-soft-light" />
    <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/40 to-black/80 sm:from-black/40 sm:via-black/60 sm:to-black" />
    <div className="absolute -top-24 right-0 h-60 w-60 bg-yellow-400/10 blur-[140px]" />
    <div className="absolute top-1/3 -left-16 h-72 w-72 bg-yellow-400/10 blur-[160px]" />
    <div
      className="absolute inset-0 opacity-20"
      style={{
        background: `radial-gradient(600px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(250, 204, 21, 0.18), transparent 60%)`
      }}
    />
  </div>
);

export default memo(HomeTrainingBackground);
