import { useState, useEffect } from 'react';

/**
 * Posición del ratón en el viewport. Usado para el efecto spotlight/parallax
 * del fondo de MethodologiesScreen.
 * @returns {{x: number, y: number}}
 */
export function useMousePosition() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (event) => {
      setMousePosition({ x: event.clientX, y: event.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return mousePosition;
}

export default useMousePosition;
