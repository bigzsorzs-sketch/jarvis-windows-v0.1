import { jarvis } from '@/api/jarvisClient';

export const ANALYZABLE_FILE_KINDS = new Set(['archive', 'code', 'document']);

export function getAnalyzableFiles(attachedFiles = []) {
  return attachedFiles.filter((file) => file?.url && ANALYZABLE_FILE_KINDS.has(file.kind));
}

export function hasAnalyzableFiles(attachedFiles = []) {
  return getAnalyzableFiles(attachedFiles).length > 0;
}

export function formatFileAnalysisContext(analyses = [], options = {}) {
  if (!analyses.length) return '';

  const title = options.title || 'ATTACHED FILE ANALYSIS';
  const instruction = options.instruction || 'Az alábbi csatolmányokat már kicsomagoltam/kiolvastam. Ezek alapján elemezz, pontozz és adj javaslatot.';

  const sections = analyses.map((analysis) => {
    const files = (analysis.extracted_files || []).map((entry) => (
      `\n--- ${entry.path} ---\n${entry.content}`
    )).join('\n');

    return `Fájl: ${analysis.name}\nTípus: ${analysis.kind}\nÖsszes fájl: ${analysis.total_files}\nFájllista: ${(analysis.listed_files || []).slice(0, 80).join(', ')}\nKiolvasott tartalom:${files || '\nNincs olvasható szöveges fájl.'}`;
  }).join('\n\n');

  return `━━━ ${title} ━━━\n${instruction}\n\n${sections}`;
}

export async function buildFileAnalysisContext(attachedFiles = [], options = {}) {
  const analyzableFiles = getAnalyzableFiles(attachedFiles);
  if (!analyzableFiles.length) return '';

  const response = await jarvis.functions.invoke('analyzeUploadedFiles', { files: analyzableFiles });
  return formatFileAnalysisContext(response.data?.analyses || [], options);
}

export function formatDeepProjectAnalysis(report) {
  if (!report?.summary) return '';
  const issues = (report.issues || [])
    .map((issue) => `- [${issue.severity}] ${issue.title}: ${issue.detail}`)
    .join('\n') || 'Nincs automatikusan talált probléma.';
  const structure = (report.summary.structure || [])
    .map((item) => `${item.folder}: ${item.count} fájl`)
    .join(', ');

  return `━━━ DEEP PROJECT ANALYSIS ━━━\nFájlok: ${report.summary.file_count}\nOlvasható fájlok: ${report.summary.readable_file_count}\nTechnológia: ${(report.summary.stack || []).join(', ')}\nStruktúra: ${structure || 'Nincs adat'}\n\nTalált jelzések:\n${issues}\n\nJavaslatok:\n${(report.recommendations || []).map((item) => `- ${item}`).join('\n')}`;
}

export async function buildDeepProjectAnalysisContext(attachedFiles = []) {
  const analyzableFiles = getAnalyzableFiles(attachedFiles);
  if (!analyzableFiles.length) return '';

  const response = await jarvis.functions.invoke('analyzeProjectDeep', { files: analyzableFiles });
  return formatDeepProjectAnalysis(response.data);
}

export function formatSpecialistProjectAnalysis(report) {
  if (!report?.categories?.length) return '';

  const categories = report.categories.map((category) => {
    const findings = category.findings?.length
      ? category.findings.map((item) => `  - ${item}`).join('\n')
      : '  - Nincs kritikus jelzés.';
    const suggestions = category.suggestions?.map((item) => `  - ${item}`).join('\n') || '  - Nincs javaslat.';
    return `${category.title} (${category.score}/100)\nJelzések:\n${findings}\nJavaslatok:\n${suggestions}`;
  }).join('\n\n');

  return `━━━ SPECIALIST PROJECT ANALYZERS ━━━\nFájlok: ${report.file_count}\nOlvasható fájlok: ${report.readable_file_count}\n\n${categories}`;
}

export async function buildSpecialistProjectAnalysisContext(attachedFiles = []) {
  const analyzableFiles = getAnalyzableFiles(attachedFiles);
  if (!analyzableFiles.length) return '';

  const response = await jarvis.functions.invoke('analyzeProjectSpecialists', { files: analyzableFiles });
  return formatSpecialistProjectAnalysis(response.data);
}