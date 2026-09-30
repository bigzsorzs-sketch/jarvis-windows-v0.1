import { useState, useCallback } from 'react';
import { createAutomotivePdf } from '@/lib/automotivePdf';

export function useAutomotivePDF(lastDiagnosis, lastParts, vehicleProfile, addMessage) {
  const [pdfLoading, setPdfLoading] = useState(false);

  const generatePDF = useCallback(async () => {
    if (!lastDiagnosis) {
      addMessage('⚠️ Először diagnosztizálj egy problémát!');
      return;
    }
    setPdfLoading(true);
    try {
      const pdfData = {
        diagnosis: lastDiagnosis.diagnosis,
        dtcCodes: [lastDiagnosis.problemCode].filter(Boolean),
        parts: lastParts,
        vehicleProfile: vehicleProfile ? {
          manufacturer: vehicleProfile.manufacturer,
          year: vehicleProfile.year,
          vin: vehicleProfile.vin,
          engine_type: vehicleProfile.engine_type,
        } : null,
        estimatedCost: lastDiagnosis.estimatedCost || 'Szerviz ajánlást követően',
      };

      const doc = await createAutomotivePdf(pdfData);
      doc.save(`auto-diagnosztika-${new Date().toISOString().slice(0,10)}.pdf`);
      addMessage('✅ Diagnosztikai PDF sikeresen letöltve! Megosztható a szervizzel.');
    } catch (error) {
      addMessage(`❌ PDF generálás hiba: ${error?.message || 'Ismeretlen hiba'}`);
    } finally {
      setPdfLoading(false);
    }
  }, [lastDiagnosis, lastParts, vehicleProfile, addMessage]);

  return { pdfLoading, generatePDF };
}