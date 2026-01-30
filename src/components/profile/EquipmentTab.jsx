import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function EquipmentTab({ onEquipmentChange }) {
  const [catalog, setCatalog] = useState([]);
  const [curated, setCurated] = useState([]);
  const [custom, setCustom] = useState([]);
  const [noEquipment, setNoEquipment] = useState(false);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [newCustom, setNewCustom] = useState('');
  const [showFullCatalog, setShowFullCatalog] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    Promise.all([
      fetch('/api/equipment/catalog', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch('/api/equipment/user', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())
    ]).then(([cat, user]) => {
      if (cat?.success) setCatalog(cat.catalog || []);
      if (user?.success) {
        const curatedItems = user.curated || [];
        const hasNone = curatedItems.some(item => item.key === 'no_equipment');
        setNoEquipment(hasNone);
        setCurated(curatedItems.filter(item => item.key !== 'no_equipment'));
        setCustom(hasNone ? [] : (user.custom || []));
      }
    }).catch(console.error);
  }, []);

  // Presets rápidos por columnas (mapeados a codes del catálogo)
  const quickPresets = [
    {
      level: 'MINIMO',
      items: [
        { code: 'towel', label: 'Toallas' },
        { code: 'chair', label: 'Silla/Sofá' },
      ]
    },
    {
      level: 'BÁSICO',
      items: [
        { code: 'mat', label: 'Esterilla' },
        { code: 'elastic_bands', label: 'Cintas elásticas' },
        { code: 'dumbbell', label: 'Mancuernas' },
        { code: 'bench', label: 'Banco/Step' }
      ]
    },
    {
      level: 'AVANZADO',
      items: [
        { code: 'trx', label: 'TRX' },
        { code: 'olympic_plates', label: 'Barra con discos profesionales' }
      ]
    }
  ];

  const grouped = useMemo(() => {
    const res = { minimo: [], basico: [], avanzado: [] };
    for (const item of catalog) {
      if (!search || item.name.toLowerCase().includes(search.toLowerCase())) {
        res[item.level]?.push(item);
      }
    }
    return res;
  }, [catalog, search]);

  const curatedKeys = useMemo(() => new Set(curated.map(i => i.key)), [curated]);

  const toggleCurated = async (code, labelFallback = null, levelFallback = null) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    if (noEquipment) return;
    const isSelected = curatedKeys.has(code);
    try {
      if (isSelected) {
        await fetch(`/api/equipment/user/${code}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
        setCurated(prev => prev.filter(i => i.key !== code));
      } else {
        await fetch('/api/equipment/user', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ equipment_key: code }) });
        const item = catalog.find(i => i.code === code);
        // Asegurar feedback inmediato incluso si el catálogo no contiene el código
        const newEntry = item
          ? { key: item.code, label: item.name, level: item.level }
          : { key: code, label: labelFallback || code, level: levelFallback };
        setCurated(prev => [...prev, newEntry]);
      }
      onEquipmentChange?.();
    } catch (e) {
      console.error('toggleCurated error', e);
    }
  };

  const addCustom = async () => {
    const name = newCustom.trim();
    if (!name) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    if (noEquipment) return;
    setAdding(true);
    try {
      const resp = await fetch('/api/equipment/custom', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ name }) });
      const data = await resp.json();
      if (data?.success && data.item) {
        setCustom(prev => [data.item, ...prev]);
        setNewCustom('');
        onEquipmentChange?.();
      }
    } catch (e) {
      console.error('addCustom error', e);
    } finally {
      setAdding(false);
    }
  };

  const removeCustom = async (id) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      await fetch(`/api/equipment/custom/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      setCustom(prev => prev.filter(c => c.id !== id));
      onEquipmentChange?.();
    } catch (e) {
      console.error('removeCustom error', e);
    }
  };

  const toggleNoEquipment = async (checked) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      if (checked) {
        await fetch('/api/equipment/user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ equipment_type: 'no_equipment' })
        });

        await Promise.all([
          ...curated.map(item =>
            fetch(`/api/equipment/user/${item.key}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` }
            })
          ),
          ...custom.map(item =>
            fetch(`/api/equipment/custom/${item.id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` }
            })
          )
        ]);

        setCurated([]);
        setCustom([]);
        setNoEquipment(true);
        onEquipmentChange?.();
        return;
      }

      await fetch('/api/equipment/user/no_equipment', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      setNoEquipment(false);
      onEquipmentChange?.();
    } catch (e) {
      console.error('toggleNoEquipment error', e);
    }
  };

  return (
    <div className="space-y-8">
      <div className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 rounded-xl p-6">
        <h3 className="text-lg font-semibold font-urbanist text-white mb-3">Sin equipamiento</h3>
        <label className="flex items-center gap-2 text-sm text-gray-200/80">
          <input
            type="checkbox"
            checked={noEquipment}
            onChange={(e) => toggleNoEquipment(e.target.checked)}
            className="h-4 w-4 accent-yellow-400"
          />
          No tengo equipamiento
        </label>
        {noEquipment && (
          <p className="text-xs text-gray-300/70 mt-2">
            Puedes desmarcarlo para volver a seleccionar equipamiento.
          </p>
        )}
      </div>

      <div className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 rounded-xl p-6">
        <h3 className="text-xl font-semibold font-urbanist text-white mb-4">Catálogo de equipamiento</h3>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar… (mancuernas, trx, esterilla)"
          disabled={noEquipment}
          className={`w-full mb-4 px-3 py-2 rounded border border-white/10 focus:outline-none focus:ring-2 focus:ring-yellow-400 ${
            noEquipment ? 'bg-white/5 text-gray-500' : 'bg-white/5 text-gray-200'
          }`}
        />

        {/* Columnas rápidas con presets clicables */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {quickPresets.map(col => (
            <div key={col.level}>
              <h4 className="text-sm uppercase tracking-wide text-gray-300/70 mb-2">{col.level}</h4>
              <div className="flex flex-wrap gap-2">
                {col.items.map(p => (
                  <button
                    key={`${col.level}-${p.code}-${p.label}`}
                    onClick={() => toggleCurated(p.code)}
                    disabled={noEquipment}
                    className={`px-3 py-1 rounded-full text-sm border transition ${
                      curatedKeys.has(p.code)
                        ? 'bg-yellow-400 text-black border-yellow-400'
                        : 'bg-white/5 text-gray-200/80 border-white/10 hover:bg-white/10'
                    } ${noEquipment ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title={p.label}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Toggle para mostrar/ocultar catálogo completo */}
        <div className="mb-4">
          <button
            onClick={() => setShowFullCatalog(v => !v)}
            className="text-sm text-yellow-400 hover:text-yellow-300 underline"
          >
            {showFullCatalog ? 'Ocultar catálogo completo' : 'Mostrar catálogo completo'}
          </button>
        </div>

        {showFullCatalog && (
          <>
            {(['minimo','basico','avanzado']).map(level => (
              <div key={level} className="mb-4">
                <h4 className="text-sm uppercase tracking-wide text-gray-300/70 mb-2">{level}</h4>
                <div className="flex flex-wrap gap-2">
                    {grouped[level].map(item => (
                      <button
                        key={item.code}
                        onClick={() => toggleCurated(item.code)}
                        disabled={noEquipment}
                        className={`px-3 py-1 rounded-full text-sm border transition ${
                          curatedKeys.has(item.code)
                            ? 'bg-yellow-400 text-black border-yellow-400'
                            : 'bg-white/5 text-gray-200/80 border-white/10 hover:bg-white/10'
                        } ${noEquipment ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title={item.name}
                      >
                        {item.name}
                      </button>
                    ))}
                  {grouped[level].length === 0 && (
                    <span className="text-gray-300/60 text-sm">Sin resultados</span>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 rounded-xl p-6">
        <h3 className="text-xl font-semibold font-urbanist text-white mb-4">Tu equipamiento</h3>
        <div className="mb-4">
          <h4 className="text-sm text-gray-300/70 mb-2">Seleccionado del catálogo</h4>
          <div className="flex flex-wrap gap-2">
            {curated.map(i => (
              <span key={i.key} className="px-3 py-1 rounded-full text-sm bg-white/5 text-gray-200/80 border border-white/10">
                {i.label}
                <button onClick={() => toggleCurated(i.key)} className="ml-2 text-yellow-400 hover:text-yellow-300">×</button>
              </span>
            ))}
            {curated.length === 0 && <span className="text-gray-300/60 text-sm">Aún no has seleccionado nada</span>}
          </div>
        </div>

        <div>
          <h4 className="text-sm text-gray-300/70 mb-2">Añade tu equipamiento (texto libre)</h4>
          <div className="flex gap-2">
            <input
              type="text"
              value={newCustom}
              onChange={(e) => setNewCustom(e.target.value)}
              placeholder="p. ej. Bicicleta estática, Comba pesada"
              disabled={noEquipment}
              className={`flex-1 px-3 py-2 rounded border border-white/10 focus:outline-none focus:ring-2 focus:ring-yellow-400 ${
                noEquipment ? 'bg-white/5 text-gray-500' : 'bg-white/5 text-gray-200'
              }`}
            />
            <button
              onClick={addCustom}
              disabled={noEquipment || adding || !newCustom.trim()}
              className="px-4 py-2 rounded bg-yellow-400 text-black font-semibold disabled:opacity-60"
            >
              {adding ? 'Añadiendo…' : 'Añadir'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {custom.map(c => (
              <span key={c.id} className="px-3 py-1 rounded-full text-sm bg-white/5 text-gray-200/80 border border-white/10">
                {c.name}
                <button onClick={() => removeCustom(c.id)} className="ml-2 text-yellow-400 hover:text-yellow-300">×</button>
              </span>
            ))}
            {custom.length === 0 && <span className="text-gray-300/60 text-sm">Sin elementos personalizados</span>}
          </div>
        </div>
      </div>

      <div className="text-center">
        <button
          onClick={() => navigate('/home-training')}
          className="px-4 py-2 rounded border border-white/10 bg-white/5 text-gray-200/80 font-semibold hover:bg-white/10 transition-colors"
        >
          Volver a Entrenamiento en casa
        </button>
      </div>
    </div>
  );
}
