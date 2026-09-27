import { invokeWithRetry } from '@/lib/llmGateway';
import normalizeAssistantReply from '@/lib/normalizeAssistantReply';
import { sanitizeAssistantText } from '@/lib/assistantResponseHandler';
import { buildDeepProjectAnalysisContext, buildFileAnalysisContext, buildSpecialistProjectAnalysisContext, hasAnalyzableFiles } from '@/lib/fileAnalysisContext';

const CODE_EXTENSIONS = new Set([
  'js', 'jsx', 'ts', 'tsx', 'css', 'scss', 'html', 'htm', 'json', 'md', 'yml', 'yaml',
  'xml', 'sql', 'sh', 'py', 'java', 'c', 'cpp', 'cs', 'php', 'rb', 'go', 'rs', 'vue', 'svelte'
]);

const CODE_KEYWORDS = /\b(k[oó]d|code|program|script|komponens|component|hiba|bug|jav[ií]ts|jav[ií]tani|refaktor|optimaliz[aá]ld|olvasd|ellen[oő]rizd|javasolj|review|fix|debug|typescript|javascript|react|css|html)\b/i;
const CODE_SHAPE = /```|import\s+.+from|export\s+default|function\s+\w+|const\s+\w+\s*=|class\s+\w+|<\/?[A-Z][\w-]*|\{\s*"[\w-]+"\s*:/;

function getExtension(fileName = '') {
  return String(fileName).toLowerCase().split('.').pop() || '';
}

function isCodeFile(file) {
  return file?.kind === 'code' || file?.kind === 'archive' || file?.kind === 'document' || CODE_EXTENSIONS.has(getExtension(file?.name));
}

export function isCodeAssistantRequest(text = '', attachedFiles = []) {
  const message = String(text || '').trim();
  return attachedFiles.some(isCodeFile) || CODE_KEYWORDS.test(message) || CODE_SHAPE.test(message);
}

export async function runCodeAssistantTurn({ message, history = [], attachedFiles = [], lang = 'hu' }) {
  const compactHistory = history
    .slice(-6)
    .map((m) => `${m.role === 'user' ? 'Felhasználó' : 'Asszisztens'}: ${String(m.content || '').slice(0, 800)}`)
    .join('\n');

  const fileList = attachedFiles
    .map((file) => `- ${file.name || 'névtelen fájl'} (${file.kind || file.type || 'fájl'})`)
    .join('\n');

  const [fileAnalysisResult, deepProjectResult, specialistProjectResult] = await Promise.allSettled([
    buildFileAnalysisContext(attachedFiles, {
      title: 'CODE FILE ANALYSIS',
      instruction: 'Az alábbi csatolmányokat már kicsomagoltam/kiolvastam. Senior kódreview szempontból elemezd őket.',
    }),
    buildDeepProjectAnalysisContext(attachedFiles),
    buildSpecialistProjectAnalysisContext(attachedFiles),
  ]);

  const fileAnalysisContext = fileAnalysisResult.status === 'fulfilled' ? fileAnalysisResult.value : '';
  const deepProjectAnalysisContext = deepProjectResult.status === 'fulfilled' ? deepProjectResult.value : '';
  const specialistProjectAnalysisContext = specialistProjectResult.status === 'fulfilled' ? specialistProjectResult.value : '';
  const analysisWarning = [fileAnalysisResult, deepProjectResult, specialistProjectResult].some((result) => result.status === 'rejected')
    ? 'Megjegyzés: egy vagy több automatikus fájlelemző nem futott le teljesen, ezért a rendelkezésre álló fájlok alapján válaszolj.'
    : '';

  const prompt = `Te egy magyarul válaszoló senior AI kódasszisztens vagy.
Feladatod: kódot olvasni, hibát keresni, javítást javasolni, refaktorálni, és érthető magyarázatot adni.

Szabályok:
- Válaszolj magyarul, röviden és gyakorlatiasan.
- Ha konkrét kódot kapsz, adj javított kódrészletet is.
- Ha hiányzik a fájl vagy kontextus, mondd meg pontosan, mit küldjön a felhasználó.
- Ne állítsd, hogy módosítottad az app forráskódját; csak elemzést/javaslatot adj, hacsak a felhasználó nem kér konkrét app-módosítást.
- Strukturáld így: Probléma, Javítás, Javasolt kód, Következő lépés.

Korábbi beszélgetés:
${compactHistory || 'Nincs.'}

Csatolt fájlok:
${fileList || 'Nincs.'}

${fileAnalysisContext}

${deepProjectAnalysisContext}

${specialistProjectAnalysisContext}

${analysisWarning}

Felhasználói kérés/kód:
${String(message || '').slice(0, 12000)}`;

  const fileUrls = hasAnalyzableFiles(attachedFiles) ? [] : attachedFiles
    .filter((file) => file?.url && (file.kind === 'code' || file.kind === 'document' || file.kind === 'archive'))
    .map((file) => file.url);

  const response = await invokeWithRetry({
    prompt,
    model: 'gemini_3_flash',
    file_urls: fileUrls.length ? fileUrls : undefined,
    queueKey: 'code-assistant',
    contains_sensitive_context: attachedFiles.length > 0,
  }, 1);

  return sanitizeAssistantText(normalizeAssistantReply(response));
}