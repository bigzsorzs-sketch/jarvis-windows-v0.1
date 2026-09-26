import { useState, useCallback } from 'react';
import { jarvis } from '@/api/jarvisClient';

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

      const response = await jarvis.functions.invoke('generateComprehensiveDiagnosticsPDF', pdfData);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `autó-diagnosztika-${new Date().toLocaleDateString('hu-HU')}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      addMessage('✅ Diagnosztikai PDF sikeresen letöltve! Megosztható a szervizzel.');
    } catch (error) {
      addMessage(`❌ PDF generálás hiba: ${error?.message || 'Ismeretlen hiba'}`);
    } finally {
      setPdfLoading(false);
    }
  }, [lastDiagnosis, lastParts, vehicleProfile, addMessage]);

  return { pdfLoading, generatePDF };
}