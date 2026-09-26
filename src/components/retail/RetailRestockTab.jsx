import { Download, FileText } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { showAppDialogMessage } from '@/lib/appDialog';

export default function RetailRestockTab({ products = [] }) {
  const needsRestock = products
    .filter((product) => (product.stock || 0) <= (product.min_stock || 5))
    .sort((a, b) => (a.stock || 0) - (b.stock || 0));

  const shoppingLines = needsRestock.map((product) => {
    const currentStock = product.stock || 0;
    const minStock = product.min_stock || 5;
    const suggestedQty = Math.max(minStock * 2 - currentStock, minStock - currentStock, 1);
    return `${product.name} | SKU: ${product.sku || '-'} | Készlet: ${currentStock} db | Minimum: ${minStock} db | Javasolt vétel: ${suggestedQty} db`;
  });

  const handleExport = async () => {
    const text = ['Bevásárlólista', '', ...shoppingLines].join('\n');
    await navigator.clipboard.writeText(text);
    showAppDialogMessage('A bevásárlólista a vágólapra lett másolva.');
  };

  const handlePdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Bevásárlólista', 14, 18);
    doc.setFontSize(11);

    let y = 30;
    needsRestock.forEach((product, index) => {
      const currentStock = product.stock || 0;
      const minStock = product.min_stock || 5;
      const suggestedQty = Math.max(minStock * 2 - currentStock, minStock - currentStock, 1);
      const line = `${index + 1}. ${product.name} | SKU: ${product.sku || '-'} | Készlet: ${currentStock} db | Minimum: ${minStock} db | Vétel: ${suggestedQty} db`;
      const wrapped = doc.splitTextToSize(line, 180);
      doc.text(wrapped, 14, y);
      y += wrapped.length * 7;
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
    });

    doc.save('bevasarlolista.pdf');
  };

  if (needsRestock.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 text-center">
        <p className="text-sm font-medium text-foreground">Most minden rendben van</p>
        <p className="text-xs text-muted-foreground mt-1">Jelenleg nincs olyan termék, amiből sürgősen venni kell.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-yellow-400">Bevásárlólista</p>
            <p className="text-xs text-muted-foreground mt-1">Ezekből a termékekből kevés maradt, érdemes venni belőlük.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleExport} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-secondary text-foreground text-xs font-medium">
              <Download size={14} /> Export
            </button>
            <button onClick={handlePdf} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-medium">
              <FileText size={14} /> PDF mentés
            </button>
          </div>
        </div>
      </div>

      {needsRestock.map((product) => {
        const currentStock = product.stock || 0;
        const minStock = product.min_stock || 5;
        const suggestedQty = Math.max(minStock * 2 - currentStock, minStock - currentStock, 1);

        return (
          <div key={product.id} className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{product.name}</p>
                <p className="text-xs text-muted-foreground mt-1">Barcode / SKU: {product.sku || 'nincs megadva'}</p>
                {product.category && <p className="text-xs text-muted-foreground">Kategória: {product.category}</p>}
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Jelenlegi készlet</p>
                <p className="text-lg font-bold text-red-400">{currentStock} db</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-4">
              <div className="bg-secondary rounded-xl p-3">
                <p className="text-[11px] text-muted-foreground">Minimum</p>
                <p className="text-sm font-semibold text-foreground mt-1">{minStock} db</p>
              </div>
              <div className="bg-secondary rounded-xl p-3">
                <p className="text-[11px] text-muted-foreground">Ajánlott vétel</p>
                <p className="text-sm font-semibold text-primary mt-1">{suggestedQty} db</p>
              </div>
              <div className="bg-secondary rounded-xl p-3">
                <p className="text-[11px] text-muted-foreground">Eladási ár</p>
                <p className="text-sm font-semibold text-foreground mt-1">£{(product.price || 0).toFixed(2)}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}