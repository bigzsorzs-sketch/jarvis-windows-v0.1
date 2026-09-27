const COMMAND = 'JARVIS_SELF_AUDIT_777';

export function isSelfAuditCommand(input, source = 'chat') {
  return source === 'chat' && input === COMMAND;
}

function runtimeChecks() {
  const desktop = typeof window !== 'undefined' ? window.jarvisDesktop : null;
  return [
    ['Electron bridge', Boolean(desktop)],
    ['Policy engine bridge', Boolean(desktop?.getRules && desktop?.evaluateAction)],
    ['System health check', Boolean(desktop?.runSystemCheck)],
    ['Encrypted backup bridge', Boolean(desktop?.backup?.create && desktop?.backup?.restore)],
    ['OBD bridge', Boolean(desktop?.obd?.connect && desktop?.obd?.send)],
    ['One-click updater', Boolean(desktop?.oneClickUpdate)],
  ];
}

async function renderAuditReport(user) {
  const checks = runtimeChecks();
  let systemReport = null;
  try {
    if (window.jarvisDesktop?.runSystemCheck) systemReport = await window.jarvisDesktop.runSystemCheck();
  } catch {}

  const lines = [
    'Private admin self-audit report',
    '',
    'Overall score: not calculated.',
    'Reason: Jarvis no longer reports a fixed self-rating. Only checks actually executed at runtime are shown.',
    '',
    'Runtime capability checks:',
    ...checks.map(([name, ok]) => `- ${ok ? 'PASS' : 'FAIL'}: ${name}`),
  ];

  if (systemReport?.checks?.length) {
    lines.push(
      '',
      `System check: ${systemReport.ok ? 'PASS' : 'ATTENTION'} · app v${systemReport.appVersion || '?'}`,
      ...systemReport.checks.map((check) => `- ${check.ok ? 'PASS' : 'WARN'}: ${check.label} — ${check.detail}`)
    );
  }

  lines.push(
    '',
    'Release checks that cannot be truthfully inferred from the running UI:',
    '- Source syntax and automated tests',
    '- Production build result',
    '- Packaged Windows startup smoke test',
    '- Dependency/security scan',
    '',
    'Those must come from CI/build evidence, not a hard-coded score.',
    '',
    `Audited as: ${user?.email || 'owner'}`
  );

  return lines.join('\n');
}

export async function handleSelfAuditCommand({ input, source = 'chat', getCurrentUser }) {
  if (!isSelfAuditCommand(input, source)) return null;
  const user = await getCurrentUser?.();
  if (!['admin', 'owner'].includes(user?.role)) {
    return { handled: true, reply: 'I can’t run that command.' };
  }
  return { handled: true, reply: await renderAuditReport(user) };
}