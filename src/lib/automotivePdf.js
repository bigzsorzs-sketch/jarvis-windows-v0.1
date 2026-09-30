import { jsPDF } from 'jspdf';
import fontUrl from '@/assets/fonts/DejaVuSans.ttf?url';

export async function createAutomotivePdf(data) {
  const response = await fetch(fontUrl);
  if (!response.ok) throw new Error('PDF_FONT_LOAD_FAILED');
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  const doc = new jsPDF();
  doc.addFileToVFS('DejaVuSans.ttf', btoa(binary));
  doc.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal');
  doc.setFont('DejaVuSans');
  doc.setFontSize(11);
  let y = 20;
  const value = item => typeof item === 'string' ? item : JSON.stringify(item ?? '', null, 2);
  const write = text => {
    for (const line of doc.splitTextToSize(String(text), 170)) {
      if (y > 275) { doc.addPage(); y = 20; }
      doc.text(line, 20, y);
      y += 6;
    }
    y += 4;
  };
  write('Jarvis – Autódiagnosztikai jelentés');
  write(new Date().toLocaleString('hu-HU'));
  write('Jármű: ' + value(data.vehicleProfile));
  write('Hibakódok: ' + value(data.dtcCodes));
  write('Diagnózis: ' + value(data.diagnosis));
  write('Alkatrészek: ' + value(data.parts));
  write('Becsült költség: ' + value(data.estimatedCost));
  return doc;
}
