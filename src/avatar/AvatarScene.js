import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { subscribeLipSync } from '@/lib/lipSyncBus';

function createMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: options.roughness ?? 0.55, metalness: options.metalness ?? 0.04 });
}

function createFallbackAvatar() {
  const root = new THREE.Group();
  root.name = 'ProceduralRealtimeAvatarFallback';

  const skin = createMaterial('#c98f78', { roughness: 0.72 });
  const hair = createMaterial('#111111', { roughness: 0.8 });
  const dark = createMaterial('#1f1717', { roughness: 0.5 });
  const white = createMaterial('#f8fafc', { roughness: 0.4 });
  const lip = createMaterial('#9f4f5f', { roughness: 0.48 });

  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 40), skin);
  head.scale.set(0.82, 1.08, 0.72);
  head.position.y = 0.2;
  root.add(head);

  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(1.03, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.62), hair);
  hairCap.scale.set(0.86, 1.02, 0.76);
  hairCap.position.y = 0.36;
  hairCap.rotation.x = -0.08;
  root.add(hairCap);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.38, 0.72, 28), skin);
  neck.position.y = -0.78;
  root.add(neck);

  const shoulder = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), createMaterial('#172033', { roughness: 0.7 }));
  shoulder.scale.set(1.45, 0.28, 0.48);
  shoulder.position.y = -1.2;
  root.add(shoulder);

  const leftEye = new THREE.Group();
  const rightEye = new THREE.Group();
  [-1, 1].forEach((side) => {
    const group = side < 0 ? leftEye : rightEye;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 12), white);
    eye.scale.set(1.25, 0.48, 0.2);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 10), dark);
    pupil.position.z = 0.09;
    group.add(eye, pupil);
    group.position.set(side * 0.32, 0.38, 0.62);
    root.add(group);
  });

  const leftBrow = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.035, 0.04), dark);
  const rightBrow = leftBrow.clone();
  leftBrow.position.set(-0.32, 0.56, 0.65);
  rightBrow.position.set(0.32, 0.56, 0.65);
  leftBrow.rotation.z = 0.12;
  rightBrow.rotation.z = -0.12;
  root.add(leftBrow, rightBrow);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.34, 24), skin);
  nose.position.set(0, 0.08, 0.7);
  nose.rotation.x = Math.PI / 2;
  root.add(nose);

  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.035, 0.045), lip);
  mouth.position.set(0, -0.28, 0.7);
  root.add(mouth);

  root.userData.parts = { head, leftEye, rightEye, leftBrow, rightBrow, mouth };
  return root;
}

function resolveLipSyncTarget(mesh) {
  if (!mesh?.morphTargetDictionary || !mesh.morphTargetInfluences) return null;
  const priorities = [
    'mouthopen', 'jawopen', 'openmouth', 'visemeaa', 'visemea', 'aa', 'ah', 'oh', 'ee', 'viseme', 'jaw', 'mouth', 'szaj'
  ];
  const entries = Object.entries(mesh.morphTargetDictionary).map(([name, index]) => ({
    name,
    index,
    normalized: name.toLowerCase().replace(/[^a-z0-9]/g, ''),
  }));
  for (const keyword of priorities) {
    const match = entries.find((entry) => entry.normalized.includes(keyword));
    if (match) return match;
  }
  return null;
}

function getGlbCapabilities(root) {
  const morphTargetNames = [];
  const lipSyncTargets = [];
  let hasSkeleton = false;
  root.traverse((child) => {
    if (child.isSkinnedMesh || child.skeleton) hasSkeleton = true;
    if ((child.isMesh || child.isSkinnedMesh) && child.morphTargetDictionary && child.morphTargetInfluences) {
      morphTargetNames.push(...Object.keys(child.morphTargetDictionary));
      const target = resolveLipSyncTarget(child);
      if (target) lipSyncTargets.push({ mesh: child.name || 'unnamed_mesh', name: target.name, index: target.index });
    }
  });
  return {
    hasMorphTargets: morphTargetNames.length > 0,
    hasLipSyncTargets: lipSyncTargets.length > 0,
    hasSkeleton,
    hasAnimations: (root.userData?.animationClips || []).length > 0,
    morphTargetNames: [...new Set(morphTargetNames)],
    lipSyncTargets,
  };
}

function findAvatarParts(root) {
  const capabilities = getGlbCapabilities(root);
  const parts = { morphMeshes: [], lipSyncTargets: [], animationClips: root.userData?.animationClips || [], capabilities };
  root.traverse((child) => {
    if ((child.isMesh || child.isSkinnedMesh) && child.morphTargetDictionary && Object.keys(child.morphTargetDictionary).length > 0) {
      parts.morphMeshes.push(child);
      const target = resolveLipSyncTarget(child);
      if (target) parts.lipSyncTargets.push({ mesh: child, ...target });
    }
  });
  return parts;
}

function logModelDebug(root, size, capabilities) {
  const meshNames = [];
  const boneNames = [];
  root.traverse((child) => {
    if (child.isMesh) meshNames.push(child.name || 'unnamed_mesh');
    if (child.isBone) boneNames.push(child.name || 'unnamed_bone');
  });
  console.info('[LiveAssistantAvatarDebug]', {
    meshNames,
    boneNames,
    ...capabilities,
    animationsCount: root.userData?.animationClips?.length || 0,
    boundingBoxSize: { x: size.x, y: size.y, z: size.z },
  });
}

const EMOTION_MORPH_MAP = {
  joy: ['smile', 'happy', 'joy', 'laugh'],
  happy: ['smile', 'happy', 'joy', 'laugh'],
  worried: ['worry', 'worried', 'sad', 'fear', 'concern'],
  anger: ['angry', 'anger', 'mad', 'frown'],
  error: ['sad', 'worry', 'worried'],
  thinking: ['brow', 'squint', 'focus'],
};

function applyMorph(mesh, keywords, value) {
  if (!mesh?.morphTargetDictionary || !mesh.morphTargetInfluences) return false;
  let applied = false;
  Object.entries(mesh.morphTargetDictionary).forEach(([targetName, index]) => {
    const normalized = targetName.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      mesh.morphTargetInfluences[index] = value;
      applied = true;
    }
  });
  return applied;
}

function applyEmotionMorphs(parts, emotion = 'neutral', intensity = 0.75) {
  if (!parts?.morphMeshes?.length) return;
  const activeKeywords = EMOTION_MORPH_MAP[emotion] || [];
  const allEmotionKeywords = Object.values(EMOTION_MORPH_MAP).flat();

  parts.morphMeshes.forEach((mesh) => {
    applyMorph(mesh, allEmotionKeywords, 0);
    if (activeKeywords.length) applyMorph(mesh, activeKeywords, intensity);
  });
}


export default function AvatarScene({ avatarUrl, animationStateRef, className = '', onFallback }) {
  const mountRef = useRef(null);
  const sceneDataRef = useRef(null);
  const frameRef = useRef(null);
  const [fallbackMode, setFallbackMode] = useState(false);
  const [staticMode, setStaticMode] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0.15, 4.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const key = new THREE.DirectionalLight('#ffffff', 2.1);
    key.position.set(1.7, 2.1, 3.2);
    scene.add(key);
    scene.add(new THREE.AmbientLight('#9fb7ff', 1.35));
    const rim = new THREE.DirectionalLight('#2dd4bf', 1.2);
    rim.position.set(-2, 1.2, -1.5);
    scene.add(rim);

    const avatarRoot = new THREE.Group();
    scene.add(avatarRoot);

    const clock = new THREE.Clock();
    const data = { scene, camera, renderer, avatarRoot, avatar: null, parts: null, mixer: null, actions: [], mounted: true, visible: !document.hidden };
    sceneDataRef.current = data;

    const resize = () => {
      const rect = mount.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    const installAvatar = (object, mode = 'glb') => {
      avatarRoot.clear();

      if (mode === 'glb') {
        object.position.set(0, 0, 0);
        object.scale.setScalar(1);
        object.updateMatrixWorld(true);

        const box = new THREE.Box3().setFromObject(object);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);

        const capabilities = getGlbCapabilities(object);
        object.userData.capabilities = capabilities;
        logModelDebug(object, size, capabilities);
        if (!capabilities.hasMorphTargets || !capabilities.hasLipSyncTargets) {
          console.warn('Model has NO morph targets for lip sync', { morphTargetNames: capabilities.morphTargetNames });
          setStaticMode(true);
          onFallback?.('static-avatar');
        } else {
          console.info('[LipSync] Using morph target', capabilities.lipSyncTargets[0]);
          setStaticMode(false);
        }

        const maxDimension = Math.max(size.x, size.y, size.z) || 1;
        const isStaticHeadModel = !capabilities.hasSkeleton && !capabilities.hasAnimations;
        const targetAvatarSize = isStaticHeadModel ? 1.48 : 1.82;
        const fittedScale = targetAvatarSize / maxDimension;
        object.scale.setScalar(fittedScale);
        object.updateMatrixWorld(true);

        const fittedBox = new THREE.Box3().setFromObject(object);
        const fittedCenter = new THREE.Vector3();
        const fittedSize = new THREE.Vector3();
        fittedBox.getCenter(fittedCenter);
        fittedBox.getSize(fittedSize);
        object.position.sub(fittedCenter);
        if (isStaticHeadModel) {
          object.position.y += 0.02;
        }
        object.updateMatrixWorld(true);

        const verticalFov = THREE.MathUtils.degToRad(camera.fov);
        const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(camera.aspect, 0.56));
        const distanceForHeight = (fittedSize.y * 0.62) / Math.tan(verticalFov / 2);
        const distanceForWidth = (fittedSize.x * 0.62) / Math.tan(horizontalFov / 2);
        const cameraDistance = Math.max(4.15, distanceForHeight, distanceForWidth);
        camera.position.set(0, 0, cameraDistance);
        camera.lookAt(0, 0, 0);
        camera.near = 0.01;
        camera.far = Math.max(100, cameraDistance * 6);
        camera.updateProjectionMatrix();
      } else {
        object.position.set(0, -0.08, 0);
        object.scale.setScalar(1.25);
      }

      avatarRoot.add(object);
      if (mode === 'glb') {
        object.updateMatrixWorld(true);
        const finalBox = new THREE.Box3().setFromObject(object);
        const finalCenter = new THREE.Vector3();
        finalBox.getCenter(finalCenter);
        object.position.x -= finalCenter.x;
        object.position.z -= finalCenter.z;
        if (!data.parts?.capabilities?.hasSkeleton && !(data.parts?.animationClips || []).length) {
          object.position.x -= 0.58;
          object.position.y += 0.36;
        }
        object.updateMatrixWorld(true);
      }
      data.avatar = object;
      data.parts = mode === 'glb' ? findAvatarParts(object) : { ...object.userData.parts, capabilities: { hasMorphTargets: true, hasSkeleton: false, hasAnimations: false, morphTargetNames: [] } };
      data.mixer = null;
      data.actions = [];
      if (mode === 'glb' && data.parts.animationClips?.length) {
        data.mixer = new THREE.AnimationMixer(object);
        data.actions = data.parts.animationClips.map((clip) => data.mixer.clipAction(clip));
        data.actions.forEach((action) => {
          action.reset();
          action.play();
          action.paused = true;
        });
      }
    };

    const installFallback = () => {
      installAvatar(createFallbackAvatar(), 'fallback');
      setFallbackMode(true);
      setStaticMode(false);
      onFallback?.('procedural');
    };

    if (avatarUrl) {
      new GLTFLoader().load(
        avatarUrl,
        (gltf) => {
          if (!data.mounted) return;
          gltf.scene.userData.animationClips = gltf.animations || [];
          installAvatar(gltf.scene, 'glb');
          setFallbackMode(false);
        },
        undefined,
        installFallback
      );
    } else {
      installFallback();
    }

    const animate = () => {
      if (!data.mounted) return;
      if (!data.visible) {
        frameRef.current = window.requestAnimationFrame(animate);
        return;
      }

      const state = animationStateRef?.current || {};
      const lipSyncLevel = Math.max(0, Math.min(1, state.lipSyncLevel || 0));
      const emotion = state.emotion || 'neutral';
      const expressionIntensity = Math.max(0, Math.min(1, state.expressionIntensity ?? 0.75));

      avatarRoot.position.y = 0;
      avatarRoot.rotation.y = 0;
      avatarRoot.rotation.x = 0;

      const parts = data.parts;
      applyEmotionMorphs(parts, emotion, expressionIntensity);
      if (parts?.lipSyncTargets?.length > 0 && parts?.capabilities?.hasLipSyncTargets) {
        parts.lipSyncTargets.forEach(({ mesh, index }) => {
          mesh.morphTargetInfluences[index] = lipSyncLevel;
        });
      }

      renderer.render(scene, camera);
      frameRef.current = window.requestAnimationFrame(animate);
    };

    const visibility = () => { data.visible = !document.hidden; };
    const unsubscribeLipSync = subscribeLipSync(({ level, active }) => {
      if (animationStateRef?.current) {
        animationStateRef.current.lipSyncLevel = active ? level : 0;
      }
      if (import.meta.env?.DEV) console.info('[LipSync] amplitude', Number(level).toFixed(3));
    });
    document.addEventListener('visibilitychange', visibility);
    resize();
    window.addEventListener('resize', resize);
    frameRef.current = window.requestAnimationFrame(animate);

    return () => {
      data.mounted = false;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      unsubscribeLipSync();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('resize', resize);
      renderer.dispose();
      scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose?.();
        if (object.material) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose?.());
        }
      });
      renderer.domElement.remove();
    };
  }, [animationStateRef, avatarUrl]);

  return React.createElement(
    'div',
    { className: `relative h-full w-full ${className}` },
    React.createElement('div', { ref: mountRef, className: 'h-full w-full' }),
    fallbackMode || staticMode
      ? React.createElement(
          'div',
          { className: 'pointer-events-none absolute right-3 top-3 rounded-full border border-primary/20 bg-background/70 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur' },
          fallbackMode ? '3D fallback' : 'Static avatar'
        )
      : null
  );
}