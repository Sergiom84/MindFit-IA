import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ShoppingCart,
  Download,
  Share2,
  Check,
  Copy,
  Printer,
  Package,
  AlertCircle
} from 'lucide-react';
import { buildShoppingList } from './shoppingListBuilder';

export default function ShoppingList({ nutritionPlan }) {
  const [shoppingList, setShoppingList] = useState(null);
  const [isEmpty, setIsEmpty] = useState(false);
  const [checkedItems, setCheckedItems] = useState({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (nutritionPlan) {
      generateShoppingList();
    }
  }, [nutritionPlan]);

  const generateShoppingList = () => {
    const built = buildShoppingList(nutritionPlan);
    setShoppingList(built.categories);
    setIsEmpty(built.itemCount === 0);
  };

  const toggleItem = (category, index) => {
    const key = `${category}-${index}`;
    setCheckedItems(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const exportToText = () => {
    if (!shoppingList) return;

    let text = '🛒 LISTA DE COMPRAS - MINDFIT\n';
    text += '═'.repeat(40) + '\n';
    text += `📅 Plan de ${nutritionPlan.plan_data?.plan_summary?.duration_days || nutritionPlan.duration_days || 7} días\n`;
    text += `📊 ${nutritionPlan.plan_data?.plan_summary?.target_calories || 'N/A'} kcal/día\n\n`;

    Object.entries(shoppingList).forEach(([category, items]) => {
      text += `\n${getCategoryEmoji(category)} ${category.toUpperCase()}\n`;
      text += '─'.repeat(30) + '\n';
      items.forEach(item => {
        const checked = checkedItems[`${category}-${items.indexOf(item)}`] ? '✓' : '☐';
        text += `${checked} ${item.name}\n`;
        text += `   Cantidad: ${item.totalAmount}\n`;
        if (item.occurrences > 1) {
          text += `   (Se usa ${item.occurrences} veces)\n`;
        }
      });
    });

    text += '\n' + '═'.repeat(40) + '\n';
    text += 'Generado por MindFit\n';
    text += new Date().toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Copiar al portapapeles
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    });
  };

  const getCategoryEmoji = (category) => {
    const emojis = {
      proteinas: '🥩',
      carbohidratos: '🌾',
      vegetales: '🥬',
      frutas: '🍎',
      lacteos: '🥛',
      grasas: '🥜',
      condimentos: '🧂',
      otros: '📦'
    };
    return emojis[category] || '📦';
  };

  const getCategoryColor = (category) => {
    const colors = {
      proteinas: 'bg-red-500',
      carbohidratos: 'bg-amber-500',
      vegetales: 'bg-green-500',
      frutas: 'bg-orange-500',
      lacteos: 'bg-blue-500',
      grasas: 'bg-yellow-500',
      condimentos: 'bg-purple-500',
      otros: 'bg-gray-500'
    };
    return colors[category] || 'bg-gray-500';
  };

  const getProgress = () => {
    if (!shoppingList) return { checked: 0, total: 0, percentage: 0 };

    const total = Object.values(shoppingList).reduce((sum, items) => sum + items.length, 0);
    const checked = Object.values(checkedItems).filter(Boolean).length;
    const percentage = total > 0 ? Math.round((checked / total) * 100) : 0;

    return { checked, total, percentage };
  };

  const progress = getProgress();

  if (!nutritionPlan) {
    return (
      <Card className="bg-neutral-900/70 border-white/10 ring-1 ring-white/5 border-l-2 border-l-yellow-400/30">
        <CardContent className="p-6 text-center">
          <ShoppingCart className="mx-auto mb-4 text-gray-400" size={48} />
          <p className="text-gray-300">No hay plan nutricional activo</p>
          <p className="text-sm text-gray-400 mt-2">
            Genera un plan nutricional primero para ver la lista de compras
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!shoppingList) {
    return (
      <Card className="bg-neutral-900/70 border-white/10 ring-1 ring-white/5 border-l-2 border-l-yellow-400/30">
        <CardContent className="p-6 text-center">
          <AlertCircle className="mx-auto mb-4 text-yellow-400" size={48} />
          <p className="text-gray-300">Generando lista de compras...</p>
        </CardContent>
      </Card>
    );
  }

  if (isEmpty) {
    return (
      <Card className="bg-neutral-900/70 border-white/10 ring-1 ring-white/5 border-l-2 border-l-yellow-400/30">
        <CardContent className="p-6 text-center">
          <Package className="mx-auto mb-4 text-yellow-300" size={48} />
          <p className="text-gray-200">Aún no hay alimentos en el menú</p>
          <p className="text-sm text-gray-400 mt-2">
            Genera los menús de los días que quieras incluir en la lista.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="bg-neutral-900/70 border-white/10 ring-1 ring-white/5 border-l-2 border-l-yellow-400/30">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2 font-urbanist">
              <ShoppingCart className="text-yellow-400" size={24} />
              Lista de Compras
            </CardTitle>
            <div className="flex gap-2">
              <Button
                onClick={exportToText}
                size="sm"
                variant="outline"
                className={`border-white/10 bg-white/5 hover:bg-white/10 ${
                  copied ? 'text-green-400 border-green-400' : 'text-white'
                }`}
              >
                {copied ? (
                  <>
                    <Check size={16} className="mr-2" />
                    Copiado!
                  </>
                ) : (
                  <>
                    <Copy size={16} className="mr-2" />
                    Copiar
                  </>
                )}
              </Button>
              <Button
                onClick={() => window.print()}
                size="sm"
                variant="outline"
                className="border-white/10 bg-white/5 text-white hover:bg-white/10"
              >
                <Printer size={16} className="mr-2" />
                Imprimir
              </Button>
            </div>
          </div>
          {/* Barra de progreso */}
          <div className="mt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-300/70">Progreso de compra</span>
              <span className="text-white font-semibold">
                {progress.checked} / {progress.total} items ({progress.percentage}%)
              </span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-2">
              <div
                className="bg-yellow-400 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {Object.entries(shoppingList).map(([category, items]) => (
              <div key={category} className="space-y-2">
                <div className="flex items-center gap-2 mb-3">
                  <Badge className={`${getCategoryColor(category)} text-white`}>
                    {getCategoryEmoji(category)} {category}
                  </Badge>
                  <span className="text-sm text-gray-400">
                    {items.length} {items.length === 1 ? 'item' : 'items'}
                  </span>
                </div>

                <div className="grid gap-2">
                  {items.map((item, index) => {
                    const itemKey = `${category}-${index}`;
                    const isChecked = checkedItems[itemKey];

                    return (
                      <div
                        key={index}
                        onClick={() => toggleItem(category, index)}
                        className={`
                          p-3 rounded-lg border cursor-pointer transition-all
                          ${isChecked
                            ? 'bg-white/5 border-white/10 border-l-2 border-l-emerald-400/40'
                            : 'bg-white/5 border-white/10 hover:bg-white/10'
                          }
                        `}
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5">
                            {isChecked ? (
                              <Check className="text-emerald-300" size={20} />
                            ) : (
                              <div className="w-5 h-5 border-2 border-white/20 rounded" />
                            )}
                          </div>
                          <div className="flex-1">
                            <div className={`font-medium ${isChecked ? 'text-gray-400 line-through' : 'text-white'}`}>
                              {item.name}
                            </div>
                            <div className="text-sm text-gray-400 mt-1">
                              <span className="font-medium">Cantidad:</span> {item.totalAmount}
                              {item.occurrences > 1 && (
                                <span className="ml-2 text-xs">
                                  (usado {item.occurrences} veces)
                                </span>
                              )}
                            </div>
                            {item.meals.length <= 3 && (
                              <div className="text-xs text-gray-500 mt-1">
                                Para: {item.meals.join(', ')}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Mensaje informativo */}
          <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-start gap-2">
            <AlertCircle className="text-yellow-400 mt-0.5 flex-shrink-0" size={16} />
            <div className="text-sm text-yellow-300">
              <strong>Consejo:</strong> Marca los items conforme los vayas comprando.
              La lista se genera automáticamente basándose en tu plan nutricional de {nutritionPlan.plan_data?.plan_summary?.duration_days || nutritionPlan.duration_days || 7} días.
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
