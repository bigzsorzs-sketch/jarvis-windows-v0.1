import * as THREE from 'three';

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.55,
    metalness: options.metalness ?? 0.18,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    emissive: options.emissive ?? '#000000',
    emissiveIntensity: options.emissiveIntensity ?? 0,
  });
}

function box(width, height, depth, mat) {
  return new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat);
}

export function createAvatarFace() {
  const root = new THREE.Group();
  root.userData.expression = 'neutral';
  root.userData.speakingIntensity = 0;

  const shellMat = material('#111827', { roughness: 0.38, metalness: 0.48 });
  const panelMat = material('#07111f', { roughness: 0.22, metalness: 0.34 });
  const glassMat = material('#0f2537', { roughness: 0.18, metalness: 0.22, transparent: true, opacity: 0.82 });
  const cyanMat = material('#2dd4bf', { roughness: 0.28, metalness: 0.12, emissive: '#14b8a6', emissiveIntensity: 0.75 });
  const cyanSoftMat = material('#38bdf8', { roughness: 0.34, metalness: 0.08, emissive: '#0284c7', emissiveIntensity: 0.48 });
  const darkMat = material('#020617', { roughness: 0.62, metalness: 0.2 });
  const neckMat = material('#1f2937', { roughness: 0.42, metalness: 0.5 });

  const headGroup = new THREE.Group();
  root.add(headGroup);

  const head = new THREE.Mesh(new THREE.SphereGeometry(1.18, 72, 48), shellMat);
  head.scale.set(0.78, 1.03, 0.64);
  head.position.y = 0.08;
  headGroup.add(head);

  const facePanel = new THREE.Mesh(new THREE.SphereGeometry(1.02, 64, 32), panelMat);
  facePanel.scale.set(0.66, 0.54, 0.1);
  facePanel.position.set(0, 0.14, 0.72);
  headGroup.add(facePanel);

  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.82, 56, 24), glassMat);
  visor.scale.set(0.82, 0.25, 0.08);
  visor.position.set(0, 0.28, 0.81);
  headGroup.add(visor);

  const chin = new THREE.Mesh(new THREE.SphereGeometry(0.6, 36, 18), shellMat);
  chin.scale.set(0.86, 0.28, 0.34);
  chin.position.set(0, -0.58, 0.27);
  headGroup.add(chin);

  const templeLeft = box(0.13, 0.72, 0.22, shellMat);
  templeLeft.position.set(-0.74, 0.08, 0.28);
  templeLeft.rotation.z = -0.08;
  const templeRight = templeLeft.clone();
  templeRight.position.x = 0.74;
  templeRight.rotation.z = 0.08;
  headGroup.add(templeLeft, templeRight);

  const createEye = (side) => {
    const group = new THREE.Group();
    group.position.set(side * 0.28, 0.28, 0.9);

    const eye = box(0.22, 0.055, 0.035, cyanMat);
    const glow = box(0.3, 0.095, 0.018, cyanSoftMat);
    glow.material = glow.material.clone();
    glow.material.transparent = true;
    glow.material.opacity = 0.38;
    glow.position.z = -0.018;

    const pupil = box(0.045, 0.07, 0.045, material('#e0ffff', { emissive: '#67e8f9', emissiveIntensity: 0.9 }));
    pupil.position.z = 0.035;

    group.add(glow, eye, pupil);
    return { group, eye, glow, pupil };
  };

  const leftEye = createEye(-1);
  const rightEye = createEye(1);
  headGroup.add(leftEye.group, rightEye.group);

  const leftBrow = box(0.34, 0.035, 0.035, cyanSoftMat);
  leftBrow.position.set(-0.29, 0.43, 0.86);
  leftBrow.rotation.z = 0.08;
  const rightBrow = leftBrow.clone();
  rightBrow.position.x = 0.29;
  rightBrow.rotation.z = -0.08;
  headGroup.add(leftBrow, rightBrow);

  const noseBridge = box(0.055, 0.22, 0.035, material('#263449', { roughness: 0.36, metalness: 0.35 }));
  noseBridge.position.set(0, 0.05, 0.88);
  headGroup.add(noseBridge);

  const mouthGroup = new THREE.Group();
  mouthGroup.position.set(0, -0.25, 0.91);
  const mouthFrame = box(0.58, 0.12, 0.03, glassMat);
  mouthGroup.add(mouthFrame);

  const mouthBars = [];
  for (let i = 0; i < 7; i += 1) {
    const bar = box(0.042, 0.035, 0.045, cyanMat);
    bar.position.x = (i - 3) * 0.065;
    bar.position.z = 0.035;
    mouthBars.push(bar);
    mouthGroup.add(bar);
  }
  headGroup.add(mouthGroup);

  const cheekLeft = box(0.16, 0.026, 0.03, cyanSoftMat);
  cheekLeft.position.set(-0.47, -0.08, 0.84);
  cheekLeft.rotation.z = 0.12;
  const cheekRight = cheekLeft.clone();
  cheekRight.position.x = 0.47;
  cheekRight.rotation.z = -0.12;
  headGroup.add(cheekLeft, cheekRight);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.44, 0.62, 36), neckMat);
  neck.position.set(0, -1.05, -0.04);
  root.add(neck);

  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(1.08, 48, 18), neckMat);
  shoulders.position.set(0, -1.46, -0.08);
  shoulders.scale.set(1.35, 0.28, 0.42);
  root.add(shoulders);


  root.userData.parts = {
    headGroup,
    head,
    facePanel,
    visor,
    chin,
    templeLeft,
    templeRight,
    leftEyeGroup: leftEye.group,
    rightEyeGroup: rightEye.group,
    leftEye: leftEye.eye,
    rightEye: rightEye.eye,
    leftEyeGlow: leftEye.glow,
    rightEyeGlow: rightEye.glow,
    leftPupil: leftEye.pupil,
    rightPupil: rightEye.pupil,
    leftBrow,
    rightBrow,
    noseBridge,
    mouthGroup,
    mouthFrame,
    mouthBars,
    cheekLeft,
    cheekRight,
    neck,
    shoulders,
  };

  return root;
}

export function updateAvatarFace(face, expression, elapsed) {
  const p = face?.userData?.parts;
  if (!p) return;

  const speaking = expression === 'speaking';
  const thinking = expression === 'thinking';
  const listening = expression === 'listening';
  const error = expression === 'error';

  const breathe = Math.sin(elapsed * 1.35) * 0.025;
  face.position.y = breathe;
  face.rotation.y = Math.sin(elapsed * 0.42) * 0.09;
  face.rotation.x = thinking ? -0.045 + Math.sin(elapsed * 1.1) * 0.025 : Math.sin(elapsed * 0.7) * 0.025;

  p.headGroup.rotation.y = Math.sin(elapsed * 0.72) * 0.055;
  p.headGroup.rotation.z = Math.sin(elapsed * 0.35) * 0.018;
  p.neck.scale.y = 1 + Math.sin(elapsed * 1.2) * 0.018;
  p.shoulders.rotation.z = Math.sin(elapsed * 0.55) * 0.018;

  const blinkWave = Math.sin(elapsed * 2.55);
  const blink = blinkWave > 0.958 ? 0.16 : 1;
  const eyeOpen = listening ? 1.18 : thinking ? 0.74 : error ? 0.55 : blink;
  const lookX = Math.sin(elapsed * 0.86) * (listening ? 0.04 : 0.025);
  const glowPulse = 1 + Math.sin(elapsed * (speaking ? 9 : 2.2)) * (speaking ? 0.12 : 0.05);

  p.leftEye.scale.set(1, eyeOpen, 1);
  p.rightEye.scale.set(1, eyeOpen, 1);
  p.leftEyeGlow.scale.set(glowPulse, eyeOpen, 1);
  p.rightEyeGlow.scale.set(glowPulse, eyeOpen, 1);
  p.leftPupil.position.x = lookX;
  p.rightPupil.position.x = lookX;
  p.leftEyeGroup.rotation.y = lookX * 1.4;
  p.rightEyeGroup.rotation.y = lookX * 1.4;

  p.leftBrow.rotation.z = thinking ? 0.28 : listening ? -0.04 : error ? -0.2 : 0.08 + Math.sin(elapsed * 1.4) * 0.02;
  p.rightBrow.rotation.z = thinking ? -0.28 : listening ? 0.04 : error ? 0.2 : -0.08 - Math.sin(elapsed * 1.4) * 0.02;
  p.leftBrow.position.y = listening ? 0.48 : error ? 0.36 : 0.43 + Math.sin(elapsed * 1.1) * 0.012;
  p.rightBrow.position.y = p.leftBrow.position.y;

  const syllable = Math.abs(Math.sin(elapsed * 15.5));
  p.mouthBars.forEach((bar, index) => {
    const phase = Math.abs(Math.sin(elapsed * (speaking ? 13.5 : 2.2) + index * 0.75));
    const h = speaking ? 0.05 + phase * (0.32 + syllable * 0.16) : listening ? 0.055 + phase * 0.035 : thinking ? 0.035 + phase * 0.025 : 0.035;
    bar.scale.y = error ? 0.45 : h / 0.035;
    bar.position.y = error ? -0.018 : 0;
  });
  p.mouthGroup.scale.x = speaking ? 1 + Math.sin(elapsed * 7) * 0.045 : 1;
  p.mouthGroup.rotation.z = error ? -0.05 : 0;

  p.cheekLeft.visible = listening || speaking;
  p.cheekRight.visible = p.cheekLeft.visible;
  p.cheekLeft.scale.x = listening ? 1.25 : 1 + syllable * 0.28;
  p.cheekRight.scale.x = p.cheekLeft.scale.x;
  p.noseBridge.rotation.z = Math.sin(elapsed * 0.9) * 0.01;

  const alertColor = error ? '#ef4444' : '#2dd4bf';
  p.leftEye.material.color.set(alertColor);
  p.rightEye.material.color.set(alertColor);
}