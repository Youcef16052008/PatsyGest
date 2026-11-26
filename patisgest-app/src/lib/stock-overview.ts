import type { StockSignal } from './workspace-data.ts';

/** Un article peut apparaître dans plusieurs catégories. */
export function stockOverview(stocks: readonly { signals: readonly StockSignal[] }[]) {
  const has = (signals: readonly StockSignal[], ...labels: string[]) => signals.some(signal => labels.includes(signal.label));
  return {
    alertes: stocks.filter(stock => stock.signals.length > 0).length,
    quantites: stocks.filter(stock => has(stock.signals, 'Rupture', 'Stock bas')).length,
    dates: stocks.filter(stock => has(stock.signals, 'DLC dépassée', 'DLC proche')).length,
    bloques: stocks.filter(stock => has(stock.signals, 'Lot bloqué')).length,
  };
}

/** Uniquement pour le filtre d'alertes : les risques les plus graves en premier. */
export function stockAlertRank(signals: readonly StockSignal[]) {
  return signals.some(signal => signal.tone === 'danger') ? 0 : signals.length ? 1 : 2;
}
