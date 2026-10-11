// A corrupt or blocked optional tutorial preference must not break a page.
export function readTutorialHistory(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem('tutorialsSeen') || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => value === true));
  } catch { return {}; }
}

export function completeTutorial(storage, tutorialId) {
  try {
    if (!storage || typeof tutorialId !== 'string' || !tutorialId) return false;
    const seen = readTutorialHistory(storage);
    Object.defineProperty(seen, tutorialId, { value:true, enumerable:true, configurable:true });
    storage.setItem('tutorialsSeen', JSON.stringify(seen));
    return true;
  } catch { return false; }
}
