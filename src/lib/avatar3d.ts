import * as THREE from "three";

/**
 * The 3D companion.
 *
 * An original stylised character built entirely from Three.js primitives — no
 * model files, nothing to download or license, and it ships in the repo as
 * code. Everything is driven imperatively so the React layer stays thin:
 * `setMouthOpen` is called from the speech loop for lip-sync, `lookAt` from
 * pointer movement, `setEmotion` from conversation state.
 *
 * Disposal matters here: WebGL resources are not garbage collected, so every
 * geometry, material and the renderer itself are tracked and released in
 * `dispose()`.
 */

export type Emotion = "neutral" | "happy" | "thinking" | "surprised";

export interface AvatarConfig {
  /** Base hue in degrees (0-360) for hair and clothing. */
  hue: number;
  /** Skin tone as a hex colour. */
  skin: number;
  /** Set true to hold the character still for reduced-motion users. */
  reducedMotion: boolean;
}

export const DEFAULT_AVATAR_CONFIG: AvatarConfig = {
  hue: 276,
  skin: 0xf3d9c8,
  reducedMotion: false,
};

/** Maps the character accent colours onto avatar hues. */
export const ACCENT_HUE: Record<string, number> = {
  violet: 276,
  rose: 345,
  amber: 38,
  emerald: 152,
  sky: 200,
  indigo: 245,
  teal: 175,
  orange: 22,
};

export class AvatarScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private frame = 0;

  // Rig references, animated each tick.
  private root = new THREE.Group();
  private head = new THREE.Group();
  private torso = new THREE.Group();
  private mouth!: THREE.Mesh;
  private browL!: THREE.Mesh;
  private browR!: THREE.Mesh;
  private lidL!: THREE.Mesh;
  private lidR!: THREE.Mesh;
  private pupilL!: THREE.Group;
  private pupilR!: THREE.Group;
  private armL = new THREE.Group();
  private armR = new THREE.Group();

  // Animation state.
  private mouthOpen = 0;
  private mouthTarget = 0;
  private emotion: Emotion = "neutral";
  private speaking = false;
  private lookX = 0;
  private lookY = 0;
  private lookTargetX = 0;
  private lookTargetY = 0;
  private blink = 0;
  private nextBlinkAt = 2;
  private elapsed = 0;

  private disposables: { dispose(): void }[] = [];
  private resizeObserver?: ResizeObserver;
  private disposed = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private config: AvatarConfig = DEFAULT_AVATAR_CONFIG,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = false;

    this.scene = new THREE.Scene();
    // Framed so the head sits in the upper third with the torso visible below.
    // The character is built standing on y = 0 with the head centred at ~1.45.
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    this.camera.position.set(0, 1.28, 3.75);
    this.camera.lookAt(0, 1.16, 0);

    this.buildLights();
    this.buildCharacter();
    this.scene.add(this.root);

    this.resize();
    if (typeof ResizeObserver !== "undefined" && canvas.parentElement) {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas.parentElement);
    }

    this.renderer.setAnimationLoop(() => this.tick());
  }

  // --- Construction -----------------------------------------------------

  private track<T extends { dispose(): void }>(resource: T): T {
    this.disposables.push(resource);
    return resource;
  }

  private material(color: THREE.ColorRepresentation, roughness = 0.75): THREE.MeshStandardMaterial {
    return this.track(new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02 }));
  }

  private buildLights() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.5));

    // Warm key from the front-left, cool rim from behind-right: enough shaping
    // to read as 3D without shadows, which are expensive and unnecessary here.
    const key = new THREE.DirectionalLight(0xfff2e6, 2.1);
    key.position.set(-2.2, 3, 3.4);
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x9fb8ff, 1.5);
    rim.position.set(2.6, 1.6, -2.4);
    this.scene.add(rim);

    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(0, -1.5, 2);
    this.scene.add(fill);
  }

  private hsl(offsetDeg: number, sat: number, light: number): THREE.Color {
    const h = (((this.config.hue + offsetDeg) % 360) + 360) % 360;
    return new THREE.Color().setHSL(h / 360, sat, light);
  }

  /**
   * Surface Z of the head sphere at a given (x, y), so facial features can be
   * placed flush against it. Getting this wrong is what makes eyes float off
   * the face or sink into it.
   */
  private faceZ(x: number, y: number): number {
    const rx = 0.52;
    const ry = 0.52 * 1.04;
    const rz = 0.52 * 0.95;
    const k = 1 - (x / rx) ** 2 - (y / ry) ** 2;
    return rz * Math.sqrt(Math.max(0.05, k));
  }

  private buildCharacter() {
    const skin = this.material(this.config.skin, 0.85);
    const hair = this.material(this.hsl(0, 0.45, 0.42), 0.7);
    const hairDark = this.material(this.hsl(-6, 0.42, 0.3), 0.7);
    const cloth = this.material(this.hsl(14, 0.38, 0.35), 0.85);
    const clothLight = this.material(this.hsl(20, 0.3, 0.62), 0.85);

    // --- Torso -----------------------------------------------------------
    const torsoGeo = this.track(new THREE.CapsuleGeometry(0.33, 0.5, 6, 20));
    const torsoMesh = new THREE.Mesh(torsoGeo, cloth);
    torsoMesh.position.y = 0.52;
    torsoMesh.scale.set(1, 1, 0.78);
    this.torso.add(torsoMesh);

    const neckGeo = this.track(new THREE.CylinderGeometry(0.14, 0.17, 0.18, 16));
    const neck = new THREE.Mesh(neckGeo, skin);
    neck.position.y = 0.96;
    this.torso.add(neck);

    const collarGeo = this.track(new THREE.TorusGeometry(0.235, 0.055, 10, 28));
    const collar = new THREE.Mesh(collarGeo, clothLight);
    collar.position.y = 0.92;
    collar.rotation.x = Math.PI / 2;
    collar.scale.set(1, 0.85, 1);
    this.torso.add(collar);

    // --- Arms (pivoting at the shoulder so they can sway) ----------------
    const armGeo = this.track(new THREE.CapsuleGeometry(0.095, 0.44, 5, 12));
    const handGeo = this.track(new THREE.SphereGeometry(0.1, 14, 12));
    for (const [group, side] of [
      [this.armL, -1],
      [this.armR, 1],
    ] as const) {
      const arm = new THREE.Mesh(armGeo, cloth);
      arm.position.y = -0.28;
      group.add(arm);

      const hand = new THREE.Mesh(handGeo, skin);
      hand.position.y = -0.55;
      group.add(hand);

      group.position.set(side * 0.36, 0.8, 0);
      group.rotation.z = side * 0.14;
      this.torso.add(group);
    }

    this.root.add(this.torso);

    // --- Head ------------------------------------------------------------
    const skullGeo = this.track(new THREE.SphereGeometry(0.52, 32, 28));
    const skull = new THREE.Mesh(skullGeo, skin);
    skull.scale.set(1, 1.04, 0.95);
    this.head.add(skull);

    // Hair: a cap that stops above the brow so the face stays readable, plus
    // a back mass and side strands. Original stylised shapes, nothing traced.
    const capGeo = this.track(
      new THREE.SphereGeometry(0.535, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.42),
    );
    const cap = new THREE.Mesh(capGeo, hair);
    cap.scale.set(1.02, 1.12, 1.0);
    cap.position.set(0, 0.01, -0.02);
    this.head.add(cap);

    // A fringe sweeping across the forehead, sitting proud of the skull.
    const fringeGeo = this.track(new THREE.SphereGeometry(0.2, 18, 14));
    for (const [fx, fy, sx, sy, sz] of [
      [-0.2, 0.3, 1.25, 0.6, 0.45],
      [0.16, 0.33, 1.0, 0.52, 0.42],
    ] as const) {
      const fringe = new THREE.Mesh(fringeGeo, hair);
      fringe.position.set(fx, fy, this.faceZ(fx, fy) - 0.06);
      fringe.scale.set(sx, sy, sz);
      fringe.rotation.z = fx < 0 ? 0.25 : -0.18;
      this.head.add(fringe);
    }

    const backGeo = this.track(new THREE.SphereGeometry(0.5, 24, 20));
    const back = new THREE.Mesh(backGeo, hairDark);
    back.position.set(0, -0.1, -0.14);
    back.scale.set(1.03, 1.18, 0.88);
    this.head.add(back);

    const sideGeo = this.track(new THREE.CapsuleGeometry(0.1, 0.36, 6, 14));
    for (const side of [-1, 1]) {
      const strand = new THREE.Mesh(sideGeo, hair);
      strand.position.set(side * 0.43, -0.16, 0.04);
      strand.rotation.z = side * 0.14;
      this.head.add(strand);
    }

    // --- Face ------------------------------------------------------------
    // Features are flat discs laid on the head's surface. Spheres here read as
    // googly eyes because they push through the skull; flat shapes give a
    // clean stylised face and keep the maths simple.
    const eyeWhiteMat = this.material(0xffffff, 0.3);
    const irisMat = this.material(this.hsl(178, 0.5, 0.4), 0.35);
    const pupilMat = this.material(0x171226, 0.25);
    const glintMat = this.track(new THREE.MeshBasicMaterial({ color: 0xffffff }));

    const eyeWhiteGeo = this.track(new THREE.CircleGeometry(0.1, 24));
    const irisGeo = this.track(new THREE.CircleGeometry(0.078, 20));
    const pupilGeo = this.track(new THREE.CircleGeometry(0.035, 16));
    const glintGeo = this.track(new THREE.CircleGeometry(0.018, 12));
    const lidGeo = this.track(new THREE.CircleGeometry(0.115, 24));
    const browGeo = this.track(new THREE.CapsuleGeometry(0.019, 0.13, 4, 8));

    const eyeY = 0.03;
    for (const side of [-1, 1]) {
      const x = side * 0.19;
      const z = this.faceZ(x, eyeY);

      const white = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
      white.position.set(x, eyeY, z + 0.004);
      white.scale.set(1, 1.12, 1);
      this.head.add(white);

      const pupilGroup = new THREE.Group();
      pupilGroup.position.set(x, eyeY, z + 0.012);

      const iris = new THREE.Mesh(irisGeo, irisMat);
      pupilGroup.add(iris);
      const pupil = new THREE.Mesh(pupilGeo, pupilMat);
      pupil.position.z = 0.004;
      pupilGroup.add(pupil);
      const glint = new THREE.Mesh(glintGeo, glintMat);
      glint.position.set(0.026, 0.03, 0.008);
      pupilGroup.add(glint);

      this.head.add(pupilGroup);
      if (side < 0) this.pupilL = pupilGroup;
      else this.pupilR = pupilGroup;

      // Eyelid: a skin-coloured disc scaled from 0 (open) to 1 (shut). It sits
      // just in front of the eye and grows downward from the top.
      const lid = new THREE.Mesh(lidGeo, skin);
      lid.position.set(x, eyeY, z + 0.02);
      lid.scale.set(1.05, 0.001, 1);
      this.head.add(lid);
      if (side < 0) this.lidL = lid;
      else this.lidR = lid;

      // Below the fringe's lower edge and proud of it, so the brow reads
      // on the face instead of poking through the hair.
      const browY = 0.142;
      const brow = new THREE.Mesh(browGeo, hairDark);
      brow.position.set(x, browY, this.faceZ(x, browY) + 0.012);
      brow.rotation.z = Math.PI / 2;
      this.head.add(brow);
      if (side < 0) this.browL = brow;
      else this.browR = brow;
    }

    // Mouth: a flat ellipse. Scaling Y is the viseme — 0 closed, 1 wide.
    const mouthGeo = this.track(new THREE.CircleGeometry(0.075, 20));
    const mouthMat = this.material(0x7e3247, 0.5);
    const mouthY = -0.2;
    this.mouth = new THREE.Mesh(mouthGeo, mouthMat);
    this.mouth.position.set(0, mouthY, this.faceZ(0, mouthY) + 0.006);
    this.mouth.scale.set(1.15, 0.16, 1);
    this.head.add(this.mouth);

    // A small nose shadow so the face has a centre.
    const noseGeo = this.track(new THREE.SphereGeometry(0.03, 12, 10));
    const nose = new THREE.Mesh(noseGeo, this.material(0xe8c4b0, 0.9));
    nose.position.set(0, -0.075, this.faceZ(0, -0.075) - 0.005);
    nose.scale.set(1, 0.7, 0.5);
    this.head.add(nose);

    // Cheeks, for a little warmth.
    const cheekGeo = this.track(new THREE.CircleGeometry(0.07, 16));
    const cheekMat = this.track(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0xff9aa6),
        transparent: true,
        opacity: 0.3,
      }),
    );
    for (const side of [-1, 1]) {
      const cx = side * 0.3;
      const cy = -0.12;
      const cheek = new THREE.Mesh(cheekGeo, cheekMat);
      cheek.position.set(cx, cy, this.faceZ(cx, cy) + 0.004);
      cheek.scale.set(1, 0.62, 1);
      this.head.add(cheek);
    }

    this.head.position.y = 1.45;
    this.root.add(this.head);
  }

  // --- Public controls --------------------------------------------------

  /** 0 = closed, 1 = wide. Called from the speech loop for lip-sync. */
  setMouthOpen(value: number) {
    this.mouthTarget = Math.max(0, Math.min(1, value));
  }

  setEmotion(emotion: Emotion) {
    this.emotion = emotion;
  }

  /** Drives idle mouth motion when no amplitude data is available. */
  setSpeaking(speaking: boolean) {
    this.speaking = speaking;
    if (!speaking) this.mouthTarget = 0;
  }

  /** Normalised -1..1 pointer position; the head and eyes follow it. */
  lookAt(x: number, y: number) {
    this.lookTargetX = Math.max(-1, Math.min(1, x));
    this.lookTargetY = Math.max(-1, Math.min(1, y));
  }

  setConfig(config: Partial<AvatarConfig>) {
    this.config = { ...this.config, ...config };
  }

  resize() {
    const parent = this.canvas.parentElement;
    const width = parent?.clientWidth || this.canvas.clientWidth || 300;
    const height = parent?.clientHeight || this.canvas.clientHeight || 400;
    if (width === 0 || height === 0) return;

    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  // --- Frame ------------------------------------------------------------

  private tick() {
    if (this.disposed) return;
    const dt = Math.min(0.05, this.clock.getDelta());
    this.elapsed += dt;
    this.frame++;

    const still = this.config.reducedMotion;
    const t = this.elapsed;

    // Idle: a slow bob and breath. Held flat under reduced motion.
    const breath = still ? 0 : Math.sin(t * 1.6) * 0.5 + 0.5;
    this.torso.scale.set(1 + breath * 0.012, 1 - breath * 0.008, 1 + breath * 0.012);
    this.root.position.y = still ? 0 : Math.sin(t * 1.15) * 0.015;
    this.root.rotation.z = still ? 0 : Math.sin(t * 0.7) * 0.012;

    // Arms sway slightly out of phase so it doesn't look mechanical.
    if (!still) {
      this.armL.rotation.z = 0.12 + Math.sin(t * 1.1) * 0.05;
      this.armR.rotation.z = -0.12 - Math.sin(t * 1.1 + 0.6) * 0.05;
      this.armL.rotation.x = Math.sin(t * 0.9) * 0.05;
      this.armR.rotation.x = Math.sin(t * 0.9 + 1.2) * 0.05;
    }

    // Head and eye tracking, eased toward the pointer.
    this.lookX += (this.lookTargetX - this.lookX) * Math.min(1, dt * 5);
    this.lookY += (this.lookTargetY - this.lookY) * Math.min(1, dt * 5);
    const drift = still ? 0 : Math.sin(t * 0.55) * 0.04;
    this.head.rotation.y = this.lookX * 0.42 + drift;
    // Sign convention, twice over: screen Y grows downward (cursor at the top
    // gives lookY = -1), and a positive X rotation points the face DOWN. The
    // two cancel, so lookY maps to rotation.x directly — negating it here is
    // what made her look down when you looked up.
    this.head.rotation.x = this.lookY * 0.26 + (still ? 0 : Math.sin(t * 0.8) * 0.015);
    this.head.rotation.z = this.lookX * 0.06;
    this.torso.rotation.y = this.lookX * 0.12;

    for (const pupil of [this.pupilL, this.pupilR]) {
      pupil.position.x =
        (pupil === this.pupilL ? -0.2 : 0.2) + this.lookX * 0.022;
      // Pupils move in screen space, so this one does need the flip.
      pupil.position.y = 0.05 - this.lookY * 0.018;
    }

    // Blink: a quick close/open on a randomised interval.
    if (!still && t > this.nextBlinkAt) {
      this.blink = 1;
      this.nextBlinkAt = t + 2.2 + Math.random() * 3.4;
    }
    if (this.blink > 0) this.blink = Math.max(0, this.blink - dt * 7);
    const closed = Math.sin(this.blink * Math.PI);
    const lidScale = 0.001 + closed * 1.12;
    this.lidL.scale.y = lidScale;
    this.lidR.scale.y = lidScale;

    // Mouth: ease toward the target so visemes don't snap. When speaking with
    // no amplitude source, synthesise a plausible envelope.
    if (this.speaking && this.mouthTarget === 0) {
      const wave =
        Math.sin(t * 17) * 0.3 + Math.sin(t * 11.3) * 0.22 + Math.sin(t * 6.1) * 0.16;
      this.mouthTarget = Math.max(0.08, Math.min(1, 0.42 + wave));
    }
    this.mouthOpen += (this.mouthTarget - this.mouthOpen) * Math.min(1, dt * 18);

    const smile = this.emotion === "happy" ? 1 : this.emotion === "surprised" ? 0.2 : 0.55;
    this.mouth.scale.set(
      1.15 + this.mouthOpen * 0.22 + (1 - smile) * 0.12,
      0.16 + this.mouthOpen * 1.05,
      1,
    );

    // Brows carry most of the expression. The capsule is modelled along Y and
    // turned horizontal at build time, so every tilt below is relative to that
    // base rotation — assigning rotation.z outright would stand them upright.
    const BROW_FLAT = Math.PI / 2;
    const browBase = 0.142;
    if (this.emotion === "happy") {
      this.browL.position.y = browBase + 0.02;
      this.browR.position.y = browBase + 0.02;
      this.browL.rotation.z = BROW_FLAT + 0.12;
      this.browR.rotation.z = BROW_FLAT - 0.12;
    } else if (this.emotion === "thinking") {
      this.browL.position.y = browBase - 0.015;
      this.browR.position.y = browBase + 0.03;
      this.browL.rotation.z = BROW_FLAT - 0.2;
      this.browR.rotation.z = BROW_FLAT - 0.05;
    } else if (this.emotion === "surprised") {
      this.browL.position.y = browBase + 0.055;
      this.browR.position.y = browBase + 0.055;
      this.browL.rotation.z = BROW_FLAT;
      this.browR.rotation.z = BROW_FLAT;
    } else {
      this.browL.position.y = browBase;
      this.browR.position.y = browBase;
      this.browL.rotation.z = BROW_FLAT + 0.04;
      this.browR.rotation.z = BROW_FLAT - 0.04;
    }

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;

    this.renderer.setAnimationLoop(null);
    this.resizeObserver?.disconnect();

    // WebGL resources are not GC'd; release every tracked geometry/material.
    for (const resource of this.disposables) {
      try {
        resource.dispose();
      } catch {
        // A already-released resource is not worth failing unmount over.
      }
    }
    this.disposables = [];
    this.renderer.dispose();
  }
}
