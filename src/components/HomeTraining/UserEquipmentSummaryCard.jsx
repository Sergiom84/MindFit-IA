import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import tokenManager from '../../utils/tokenManager';

export default function UserEquipmentSummaryCard() {
  const [curated, setCurated] = useState([]);
  const [custom, setCustom] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const token = tokenManager.getToken();
    if (!token) return;
    fetch('/api/equipment/user', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        if (data?.success) {
          setCurated(data.curated || []);
          setCustom(data.custom || []);
        }
      })
      .catch(console.error);
  }, []);

  const preview = [
    ...curated.map(c => c.label),
    ...custom.map(c => c.name)
  ].slice(0, 6);

  return (
    <>
      {preview.length > 0 ? (
        <p className="text-gray-300 mb-4 mx-auto max-w-2xl">
          Usaremos tu equipamiento real para adaptar los ejercicios. Ejemplos: {preview.join(', ')}{(curated.length + custom.length) > preview.length ? '…' : ''}
        </p>
      ) : (
        <p className="text-gray-400 mb-4 mx-auto max-w-2xl">Aún no has indicado tu equipamiento. Cuéntanos qué tienes para personalizar mejor tus entrenamientos.</p>
      )}
      <div className="flex gap-3 justify-center">
        <button
          onClick={() => navigate('/profile?tab=equipment')}
          className="px-4 py-2 rounded bg-yellow-400 text-black font-semibold"
        >
          Gestionar mi equipamiento
        </button>
      </div>
    </>
  );
}