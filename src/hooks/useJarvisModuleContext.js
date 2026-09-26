import { useEffect, useRef } from 'react';
import { registerJarvisModule, setActiveJarvisModule } from '@/lib/capabilityBus';

/**
 * Registers a page/module with Jarvis' contextual capability layer.
 * getContext/getActions always read the latest React state through refs.
 */
export function useJarvisModuleContext({
  id,
  label,
  getContext,
  getActions,
  active = true,
}) {
  const contextRef = useRef(getContext);
  const actionsRef = useRef(getActions);

  contextRef.current = getContext;
  actionsRef.current = getActions;

  useEffect(() => {
    if (!id) return undefined;

    const unregister = registerJarvisModule({
      id,
      label,
      activate: active,
      getContext: () => contextRef.current?.() || {},
      getActions: () => actionsRef.current?.() || {},
    });

    if (active) setActiveJarvisModule(id);
    return unregister;
  }, [id, label, active]);
}

export default useJarvisModuleContext;
