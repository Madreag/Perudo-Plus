// ============================================
// Perudo+ Stage Manager
// Handles different visual stages/scenes
// ============================================

import * as THREE from 'three';
import { StageType } from '../shared/types';

// Shader code for water effect (beach scene)
const waterVertexShader = `
  varying vec2 vUv;
  varying vec3 vPosition;
  uniform float uTime;
  
  void main() {
    vUv = uv;
    vPosition = position;
    
    vec3 pos = position;
    float wave = sin(pos.x * 2.0 + uTime) * 0.1 + sin(pos.z * 1.5 + uTime * 0.8) * 0.1;
    pos.y += wave;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const waterFragmentShader = `
  varying vec2 vUv;
  varying vec3 vPosition;
  uniform float uTime;
  
  void main() {
    vec3 deepBlue = vec3(0.0, 0.2, 0.4);
    vec3 lightBlue = vec3(0.2, 0.5, 0.8);
    
    float wave = sin(vPosition.x * 3.0 + uTime * 2.0) * 0.5 + 0.5;
    wave += sin(vPosition.z * 2.0 + uTime * 1.5) * 0.5 + 0.5;
    wave *= 0.5;
    
    vec3 color = mix(deepBlue, lightBlue, wave);
    
    // Add foam effect near edges
    float foam = smoothstep(0.8, 1.0, wave);
    color = mix(color, vec3(1.0), foam * 0.3);
    
    gl_FragColor = vec4(color, 0.9);
  }
`;

// Shader for torch/fire glow (dungeon scene)
const fireVertexShader = `
  varying vec2 vUv;
  
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fireFragmentShader = `
  varying vec2 vUv;
  uniform float uTime;
  
  float noise(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }
  
  void main() {
    vec2 uv = vUv;
    
    // Create flickering effect
    float flicker = noise(vec2(uTime * 10.0, 0.0)) * 0.3 + 0.7;
    
    // Fire gradient
    float gradient = 1.0 - uv.y;
    gradient = pow(gradient, 1.5);
    
    vec3 orange = vec3(1.0, 0.5, 0.0);
    vec3 yellow = vec3(1.0, 0.9, 0.3);
    vec3 red = vec3(0.8, 0.2, 0.0);
    
    vec3 color = mix(red, orange, gradient);
    color = mix(color, yellow, pow(gradient, 2.0));
    
    color *= flicker;
    
    float alpha = gradient * flicker;
    
    gl_FragColor = vec4(color, alpha);
  }
`;

// Shader for neon glow (casino scene)
const neonVertexShader = `
  varying vec2 vUv;
  
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const neonFragmentShader = `
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3 uColor;
  
  void main() {
    vec2 uv = vUv;
    
    // Pulsing glow effect
    float pulse = sin(uTime * 2.0) * 0.2 + 0.8;
    
    // Edge glow
    float dist = length(uv - 0.5) * 2.0;
    float glow = 1.0 - smoothstep(0.0, 1.0, dist);
    glow = pow(glow, 2.0);
    
    vec3 color = uColor * glow * pulse;
    
    gl_FragColor = vec4(color, glow * pulse);
  }
`;

export interface StageElements {
  group: THREE.Group;
  update: (time: number) => void;
  dispose: () => void;
}

export class StageManager {
  private scene: THREE.Scene;
  private currentStage: StageType = 'casino';
  private stageElements: StageElements | null = null;
  private startTime: number = Date.now();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public getCurrentStage(): StageType {
    return this.currentStage;
  }

  public setStage(stage: StageType): void {
    if (this.currentStage === stage && this.stageElements) {
      return;
    }

    // Clean up current stage
    if (this.stageElements) {
      this.scene.remove(this.stageElements.group);
      this.stageElements.dispose();
      this.stageElements = null;
    }

    this.currentStage = stage;

    // Create new stage
    switch (stage) {
      case 'casino':
        this.stageElements = this.createCasinoStage();
        break;
      case 'dungeon':
        this.stageElements = this.createDungeonStage();
        break;
      case 'beach':
        this.stageElements = this.createBeachStage();
        break;
    }

    if (this.stageElements) {
      this.scene.add(this.stageElements.group);
    }

    // Update scene background
    this.updateSceneBackground(stage);
  }

  private updateSceneBackground(stage: StageType): void {
    switch (stage) {
      case 'casino':
        this.scene.background = new THREE.Color(0x1a1a2e);
        break;
      case 'dungeon':
        this.scene.background = new THREE.Color(0x0a0a0f);
        break;
      case 'beach':
        this.scene.background = new THREE.Color(0x87ceeb);
        break;
    }
  }

  public update(): void {
    if (this.stageElements) {
      const time = (Date.now() - this.startTime) / 1000;
      this.stageElements.update(time);
    }
  }

  private createCasinoStage(): StageElements {
    const group = new THREE.Group();
    const uniforms: { [key: string]: THREE.IUniform }[] = [];

    // Floor with carpet pattern
    const floorGeometry = new THREE.PlaneGeometry(60, 60);
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d1f3d,
      roughness: 0.8,
      metalness: 0.1
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.5;
    floor.receiveShadow = true;
    group.add(floor);

    // Decorative carpet pattern
    const carpetGeometry = new THREE.RingGeometry(12, 25, 64);
    const carpetMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b0000,
      roughness: 0.9,
      metalness: 0
    });
    const carpet = new THREE.Mesh(carpetGeometry, carpetMaterial);
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.y = -0.49;
    group.add(carpet);

    // Slot machines around the perimeter
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const radius = 18;
      const slotMachine = this.createSlotMachine();
      slotMachine.position.set(
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius
      );
      slotMachine.rotation.y = -angle + Math.PI;
      group.add(slotMachine);
    }

    // Neon signs
    const neonColors = [0xff0066, 0x00ffff, 0xffff00, 0x00ff00];
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const radius = 22;
      
      const neonUniform = {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(neonColors[i]) }
      };
      uniforms.push(neonUniform);
      
      const neonGeometry = new THREE.PlaneGeometry(3, 1);
      const neonMaterial = new THREE.ShaderMaterial({
        vertexShader: neonVertexShader,
        fragmentShader: neonFragmentShader,
        uniforms: neonUniform,
        transparent: true,
        side: THREE.DoubleSide
      });
      
      const neon = new THREE.Mesh(neonGeometry, neonMaterial);
      neon.position.set(
        Math.cos(angle) * radius,
        4,
        Math.sin(angle) * radius
      );
      neon.rotation.y = -angle + Math.PI;
      group.add(neon);
    }

    // Chandelier
    const chandelier = this.createChandelier();
    chandelier.position.set(0, 12, 0);
    group.add(chandelier);

    // Velvet rope barriers
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const radius = 14;
      const post = this.createVelvetRopePost();
      post.position.set(
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius
      );
      group.add(post);
    }

    return {
      group,
      update: (time: number) => {
        uniforms.forEach(u => {
          u.uTime.value = time;
        });
      },
      dispose: () => {
        group.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (Array.isArray(child.material)) {
              child.material.forEach(m => m.dispose());
            } else {
              child.material.dispose();
            }
          }
        });
      }
    };
  }

  private createSlotMachine(): THREE.Group {
    const machine = new THREE.Group();

    // Main body
    const bodyGeometry = new THREE.BoxGeometry(1.5, 2.5, 1);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0xcc0000,
      roughness: 0.3,
      metalness: 0.7
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 1.25;
    body.castShadow = true;
    machine.add(body);

    // Screen
    const screenGeometry = new THREE.BoxGeometry(1.2, 0.8, 0.1);
    const screenMaterial = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: 0x222222,
      roughness: 0.1,
      metalness: 0.9
    });
    const screen = new THREE.Mesh(screenGeometry, screenMaterial);
    screen.position.set(0, 1.8, 0.5);
    machine.add(screen);

    // Lever
    const leverGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.8);
    const leverMaterial = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      roughness: 0.2,
      metalness: 0.8
    });
    const lever = new THREE.Mesh(leverGeometry, leverMaterial);
    lever.position.set(0.9, 1.5, 0);
    lever.rotation.z = Math.PI / 6;
    machine.add(lever);

    // Lever ball
    const ballGeometry = new THREE.SphereGeometry(0.1);
    const ball = new THREE.Mesh(ballGeometry, leverMaterial);
    ball.position.set(1.1, 1.9, 0);
    machine.add(ball);

    return machine;
  }

  private createChandelier(): THREE.Group {
    const chandelier = new THREE.Group();

    // Central hub
    const hubGeometry = new THREE.SphereGeometry(0.5);
    const goldMaterial = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      roughness: 0.2,
      metalness: 0.9
    });
    const hub = new THREE.Mesh(hubGeometry, goldMaterial);
    chandelier.add(hub);

    // Arms and crystals
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const radius = 2;

      // Arm
      const armGeometry = new THREE.CylinderGeometry(0.05, 0.05, radius);
      const arm = new THREE.Mesh(armGeometry, goldMaterial);
      arm.position.set(
        Math.cos(angle) * radius / 2,
        -0.5,
        Math.sin(angle) * radius / 2
      );
      arm.rotation.z = Math.PI / 2;
      arm.rotation.y = angle;
      chandelier.add(arm);

      // Crystal
      const crystalGeometry = new THREE.OctahedronGeometry(0.3);
      const crystalMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.1,
        metalness: 0.2,
        transparent: true,
        opacity: 0.8
      });
      const crystal = new THREE.Mesh(crystalGeometry, crystalMaterial);
      crystal.position.set(
        Math.cos(angle) * radius,
        -1,
        Math.sin(angle) * radius
      );
      chandelier.add(crystal);

      // Light
      const light = new THREE.PointLight(0xffffcc, 0.5, 10);
      light.position.copy(crystal.position);
      chandelier.add(light);
    }

    return chandelier;
  }

  private createVelvetRopePost(): THREE.Group {
    const post = new THREE.Group();

    // Post
    const postGeometry = new THREE.CylinderGeometry(0.08, 0.1, 1.2);
    const goldMaterial = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      roughness: 0.2,
      metalness: 0.9
    });
    const postMesh = new THREE.Mesh(postGeometry, goldMaterial);
    postMesh.position.y = 0.6;
    post.add(postMesh);

    // Top ball
    const ballGeometry = new THREE.SphereGeometry(0.12);
    const ball = new THREE.Mesh(ballGeometry, goldMaterial);
    ball.position.y = 1.3;
    post.add(ball);

    // Base
    const baseGeometry = new THREE.CylinderGeometry(0.2, 0.25, 0.1);
    const base = new THREE.Mesh(baseGeometry, goldMaterial);
    base.position.y = 0.05;
    post.add(base);

    return post;
  }

  private createDungeonStage(): StageElements {
    const group = new THREE.Group();
    const uniforms: { [key: string]: THREE.IUniform }[] = [];

    // Stone floor
    const floorGeometry = new THREE.PlaneGeometry(60, 60, 20, 20);
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x3a3a3a,
      roughness: 0.95,
      metalness: 0.05
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.5;
    floor.receiveShadow = true;
    group.add(floor);

    // Stone walls (circular dungeon)
    const wallHeight = 8;
    const wallRadius = 20;
    const wallSegments = 24;
    
    for (let i = 0; i < wallSegments; i++) {
      const angle = (i / wallSegments) * Math.PI * 2;
      const nextAngle = ((i + 1) / wallSegments) * Math.PI * 2;
      
      const wallGeometry = new THREE.BoxGeometry(
        wallRadius * Math.sin(Math.PI / wallSegments) * 2.1,
        wallHeight,
        1
      );
      const wallMaterial = new THREE.MeshStandardMaterial({
        color: 0x4a4a4a,
        roughness: 0.9,
        metalness: 0.1
      });
      const wall = new THREE.Mesh(wallGeometry, wallMaterial);
      wall.position.set(
        Math.cos(angle + Math.PI / wallSegments) * wallRadius,
        wallHeight / 2 - 0.5,
        Math.sin(angle + Math.PI / wallSegments) * wallRadius
      );
      wall.rotation.y = -angle - Math.PI / wallSegments;
      wall.castShadow = true;
      wall.receiveShadow = true;
      group.add(wall);
    }

    // Torches with fire shader
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const radius = 18;
      
      const torch = this.createTorch();
      torch.position.set(
        Math.cos(angle) * radius,
        3,
        Math.sin(angle) * radius
      );
      torch.rotation.y = -angle + Math.PI;
      group.add(torch);

      // Fire effect
      const fireUniform = { uTime: { value: 0 } };
      uniforms.push(fireUniform);
      
      const fireGeometry = new THREE.PlaneGeometry(0.5, 0.8);
      const fireMaterial = new THREE.ShaderMaterial({
        vertexShader: fireVertexShader,
        fragmentShader: fireFragmentShader,
        uniforms: fireUniform,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      
      const fire = new THREE.Mesh(fireGeometry, fireMaterial);
      fire.position.set(
        Math.cos(angle) * radius,
        3.8,
        Math.sin(angle) * radius
      );
      // Make fire always face camera (billboard effect handled in update)
      fire.userData.isFire = true;
      group.add(fire);

      // Point light for torch
      const torchLight = new THREE.PointLight(0xff6600, 1, 8);
      torchLight.position.set(
        Math.cos(angle) * radius,
        3.5,
        Math.sin(angle) * radius
      );
      group.add(torchLight);
    }

    // Stone pillars
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const radius = 12;
      const pillar = this.createStonePillar();
      pillar.position.set(
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius
      );
      group.add(pillar);
    }

    // Chains hanging from ceiling
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const radius = 8;
      const chain = this.createChain();
      chain.position.set(
        Math.cos(angle) * radius,
        6,
        Math.sin(angle) * radius
      );
      group.add(chain);
    }

    // Skulls and bones scattered
    for (let i = 0; i < 5; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 5 + Math.random() * 8;
      const skull = this.createSkull();
      skull.position.set(
        Math.cos(angle) * radius,
        -0.3,
        Math.sin(angle) * radius
      );
      skull.rotation.y = Math.random() * Math.PI * 2;
      skull.scale.setScalar(0.3 + Math.random() * 0.2);
      group.add(skull);
    }

    // Cobwebs in corners
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const radius = 19;
      const cobweb = this.createCobweb();
      cobweb.position.set(
        Math.cos(angle) * radius,
        6,
        Math.sin(angle) * radius
      );
      cobweb.rotation.y = -angle;
      group.add(cobweb);
    }

    return {
      group,
      update: (time: number) => {
        uniforms.forEach(u => {
          u.uTime.value = time;
        });
        // Flicker torch lights
        group.traverse((child) => {
          if (child instanceof THREE.PointLight && child.color.getHex() === 0xff6600) {
            child.intensity = 0.8 + Math.random() * 0.4;
          }
        });
      },
      dispose: () => {
        group.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (Array.isArray(child.material)) {
              child.material.forEach(m => m.dispose());
            } else {
              child.material.dispose();
            }
          }
        });
      }
    };
  }

  private createTorch(): THREE.Group {
    const torch = new THREE.Group();

    // Handle
    const handleGeometry = new THREE.CylinderGeometry(0.05, 0.08, 0.8);
    const woodMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a3728,
      roughness: 0.9,
      metalness: 0.1
    });
    const handle = new THREE.Mesh(handleGeometry, woodMaterial);
    torch.add(handle);

    // Bracket
    const bracketGeometry = new THREE.TorusGeometry(0.1, 0.02, 8, 16, Math.PI);
    const ironMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      roughness: 0.7,
      metalness: 0.8
    });
    const bracket = new THREE.Mesh(bracketGeometry, ironMaterial);
    bracket.rotation.x = Math.PI / 2;
    bracket.position.z = -0.1;
    torch.add(bracket);

    return torch;
  }

  private createStonePillar(): THREE.Group {
    const pillar = new THREE.Group();

    // Main column
    const columnGeometry = new THREE.CylinderGeometry(0.6, 0.7, 6, 8);
    const stoneMaterial = new THREE.MeshStandardMaterial({
      color: 0x5a5a5a,
      roughness: 0.9,
      metalness: 0.1
    });
    const column = new THREE.Mesh(columnGeometry, stoneMaterial);
    column.position.y = 2.5;
    column.castShadow = true;
    pillar.add(column);

    // Base
    const baseGeometry = new THREE.CylinderGeometry(0.9, 1, 0.5, 8);
    const base = new THREE.Mesh(baseGeometry, stoneMaterial);
    base.position.y = 0.25;
    pillar.add(base);

    // Capital
    const capitalGeometry = new THREE.CylinderGeometry(0.8, 0.6, 0.4, 8);
    const capital = new THREE.Mesh(capitalGeometry, stoneMaterial);
    capital.position.y = 5.7;
    pillar.add(capital);

    return pillar;
  }

  private createChain(): THREE.Group {
    const chain = new THREE.Group();
    const ironMaterial = new THREE.MeshStandardMaterial({
      color: 0x3a3a3a,
      roughness: 0.6,
      metalness: 0.9
    });

    for (let i = 0; i < 8; i++) {
      const linkGeometry = new THREE.TorusGeometry(0.1, 0.03, 8, 16);
      const link = new THREE.Mesh(linkGeometry, ironMaterial);
      link.position.y = -i * 0.18;
      link.rotation.x = i % 2 === 0 ? 0 : Math.PI / 2;
      chain.add(link);
    }

    return chain;
  }

  private createSkull(): THREE.Group {
    const skull = new THREE.Group();
    const boneMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4c4a8,
      roughness: 0.8,
      metalness: 0.1
    });

    // Cranium
    const craniumGeometry = new THREE.SphereGeometry(0.5, 16, 12);
    craniumGeometry.scale(1, 0.9, 1.1);
    const cranium = new THREE.Mesh(craniumGeometry, boneMaterial);
    skull.add(cranium);

    // Eye sockets
    const eyeGeometry = new THREE.SphereGeometry(0.12);
    const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
    
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-0.15, 0.05, 0.4);
    skull.add(leftEye);
    
    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(0.15, 0.05, 0.4);
    skull.add(rightEye);

    // Jaw
    const jawGeometry = new THREE.BoxGeometry(0.4, 0.15, 0.3);
    const jaw = new THREE.Mesh(jawGeometry, boneMaterial);
    jaw.position.set(0, -0.35, 0.2);
    skull.add(jaw);

    return skull;
  }

  private createCobweb(): THREE.Group {
    const cobweb = new THREE.Group();
    const webMaterial = new THREE.MeshBasicMaterial({
      color: 0xcccccc,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide
    });

    // Simple triangular web
    const webGeometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      0, 0, 0,
      -1, -1.5, 0.2,
      1, -1.5, 0.2
    ]);
    webGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    const web = new THREE.Mesh(webGeometry, webMaterial);
    cobweb.add(web);

    return cobweb;
  }

  private createBeachStage(): StageElements {
    const group = new THREE.Group();
    const waterUniforms = { uTime: { value: 0 } };

    // Sand floor
    const sandGeometry = new THREE.CircleGeometry(25, 64);
    const sandMaterial = new THREE.MeshStandardMaterial({
      color: 0xf4d03f,
      roughness: 0.9,
      metalness: 0
    });
    const sand = new THREE.Mesh(sandGeometry, sandMaterial);
    sand.rotation.x = -Math.PI / 2;
    sand.position.y = -0.5;
    sand.receiveShadow = true;
    group.add(sand);

    // Ocean water with shader
    const waterGeometry = new THREE.PlaneGeometry(100, 40, 50, 50);
    const waterMaterial = new THREE.ShaderMaterial({
      vertexShader: waterVertexShader,
      fragmentShader: waterFragmentShader,
      uniforms: waterUniforms,
      transparent: true,
      side: THREE.DoubleSide
    });
    const water = new THREE.Mesh(waterGeometry, waterMaterial);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -0.3, -35);
    group.add(water);

    // Palm trees
    const palmPositions = [
      { x: -15, z: 10 },
      { x: 18, z: 8 },
      { x: -12, z: -8 },
      { x: 16, z: -10 },
      { x: -20, z: 0 },
      { x: 22, z: 2 }
    ];

    palmPositions.forEach(pos => {
      const palm = this.createPalmTree();
      palm.position.set(pos.x, -0.5, pos.z);
      palm.rotation.y = Math.random() * Math.PI * 2;
      group.add(palm);
    });

    // Beach umbrella
    const umbrella = this.createBeachUmbrella();
    umbrella.position.set(-8, -0.5, 5);
    group.add(umbrella);

    // Beach chairs
    const chair1 = this.createBeachChair();
    chair1.position.set(-6, -0.5, 6);
    chair1.rotation.y = -0.3;
    group.add(chair1);

    const chair2 = this.createBeachChair();
    chair2.position.set(-10, -0.5, 6);
    chair2.rotation.y = 0.3;
    group.add(chair2);

    // Seashells scattered
    for (let i = 0; i < 15; i++) {
      const shell = this.createSeashell();
      const angle = Math.random() * Math.PI * 2;
      const radius = 3 + Math.random() * 18;
      shell.position.set(
        Math.cos(angle) * radius,
        -0.45,
        Math.sin(angle) * radius
      );
      shell.rotation.y = Math.random() * Math.PI * 2;
      shell.scale.setScalar(0.1 + Math.random() * 0.15);
      group.add(shell);
    }

    // Beach ball
    const beachBall = this.createBeachBall();
    beachBall.position.set(5, 0, 8);
    group.add(beachBall);

    // Surfboard
    const surfboard = this.createSurfboard();
    surfboard.position.set(12, -0.3, 5);
    surfboard.rotation.y = 0.5;
    surfboard.rotation.x = 0.1;
    group.add(surfboard);

    // Sun (directional light source visual)
    const sunGeometry = new THREE.SphereGeometry(3);
    const sunMaterial = new THREE.MeshBasicMaterial({
      color: 0xffff00
    });
    const sun = new THREE.Mesh(sunGeometry, sunMaterial);
    sun.position.set(30, 25, -30);
    group.add(sun);

    // Clouds
    for (let i = 0; i < 5; i++) {
      const cloud = this.createCloud();
      cloud.position.set(
        -30 + Math.random() * 60,
        15 + Math.random() * 5,
        -40 + Math.random() * 20
      );
      cloud.scale.setScalar(1 + Math.random() * 2);
      group.add(cloud);
    }

    return {
      group,
      update: (time: number) => {
        waterUniforms.uTime.value = time;
        
        // Animate palm tree leaves slightly
        group.traverse((child) => {
          if (child.userData.isPalmLeaf) {
            child.rotation.z = Math.sin(time * 2 + child.userData.leafIndex) * 0.05;
          }
        });
      },
      dispose: () => {
        group.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (Array.isArray(child.material)) {
              child.material.forEach(m => m.dispose());
            } else {
              child.material.dispose();
            }
          }
        });
      }
    };
  }

  private createPalmTree(): THREE.Group {
    const palm = new THREE.Group();

    // Trunk
    const trunkGeometry = new THREE.CylinderGeometry(0.2, 0.4, 6, 8);
    const trunkMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b4513,
      roughness: 0.9,
      metalness: 0.1
    });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = 3;
    trunk.castShadow = true;
    palm.add(trunk);

    // Leaves
    const leafMaterial = new THREE.MeshStandardMaterial({
      color: 0x228b22,
      roughness: 0.8,
      metalness: 0,
      side: THREE.DoubleSide
    });

    for (let i = 0; i < 7; i++) {
      const leafGeometry = new THREE.PlaneGeometry(0.8, 3);
      const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
      const angle = (i / 7) * Math.PI * 2;
      leaf.position.set(
        Math.cos(angle) * 0.5,
        6,
        Math.sin(angle) * 0.5
      );
      leaf.rotation.y = angle;
      leaf.rotation.x = -0.5;
      leaf.userData.isPalmLeaf = true;
      leaf.userData.leafIndex = i;
      palm.add(leaf);
    }

    // Coconuts
    const coconutGeometry = new THREE.SphereGeometry(0.15);
    const coconutMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b4513,
      roughness: 0.7,
      metalness: 0.1
    });

    for (let i = 0; i < 3; i++) {
      const coconut = new THREE.Mesh(coconutGeometry, coconutMaterial);
      const angle = (i / 3) * Math.PI * 2;
      coconut.position.set(
        Math.cos(angle) * 0.3,
        5.7,
        Math.sin(angle) * 0.3
      );
      palm.add(coconut);
    }

    return palm;
  }

  private createBeachUmbrella(): THREE.Group {
    const umbrella = new THREE.Group();

    // Pole
    const poleGeometry = new THREE.CylinderGeometry(0.05, 0.05, 3);
    const poleMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.5,
      metalness: 0.3
    });
    const pole = new THREE.Mesh(poleGeometry, poleMaterial);
    pole.position.y = 1.5;
    umbrella.add(pole);

    // Canopy
    const canopyGeometry = new THREE.ConeGeometry(2, 0.8, 16, 1, true);
    const canopyMaterial = new THREE.MeshStandardMaterial({
      color: 0xff6b6b,
      roughness: 0.8,
      metalness: 0,
      side: THREE.DoubleSide
    });
    const canopy = new THREE.Mesh(canopyGeometry, canopyMaterial);
    canopy.position.y = 3;
    canopy.rotation.x = Math.PI;
    umbrella.add(canopy);

    // Stripes
    const stripeGeometry = new THREE.ConeGeometry(2.01, 0.81, 16, 1, true);
    const stripeMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.8,
      metalness: 0,
      side: THREE.DoubleSide
    });
    const stripe = new THREE.Mesh(stripeGeometry, stripeMaterial);
    stripe.position.y = 3;
    stripe.rotation.x = Math.PI;
    stripe.rotation.y = Math.PI / 8;
    umbrella.add(stripe);

    return umbrella;
  }

  private createBeachChair(): THREE.Group {
    const chair = new THREE.Group();

    const frameMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.5,
      metalness: 0.3
    });

    const fabricMaterial = new THREE.MeshStandardMaterial({
      color: 0x4169e1,
      roughness: 0.9,
      metalness: 0
    });

    // Frame legs
    const legGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.8);
    
    const leg1 = new THREE.Mesh(legGeometry, frameMaterial);
    leg1.position.set(-0.4, 0.4, 0.3);
    leg1.rotation.z = 0.2;
    chair.add(leg1);

    const leg2 = new THREE.Mesh(legGeometry, frameMaterial);
    leg2.position.set(0.4, 0.4, 0.3);
    leg2.rotation.z = -0.2;
    chair.add(leg2);

    const leg3 = new THREE.Mesh(legGeometry, frameMaterial);
    leg3.position.set(-0.4, 0.4, -0.3);
    leg3.rotation.z = 0.2;
    chair.add(leg3);

    const leg4 = new THREE.Mesh(legGeometry, frameMaterial);
    leg4.position.set(0.4, 0.4, -0.3);
    leg4.rotation.z = -0.2;
    chair.add(leg4);

    // Seat
    const seatGeometry = new THREE.BoxGeometry(1, 0.05, 0.6);
    const seat = new THREE.Mesh(seatGeometry, fabricMaterial);
    seat.position.set(0, 0.5, 0);
    seat.rotation.x = -0.2;
    chair.add(seat);

    // Back
    const backGeometry = new THREE.BoxGeometry(1, 0.8, 0.05);
    const back = new THREE.Mesh(backGeometry, fabricMaterial);
    back.position.set(0, 0.9, -0.25);
    back.rotation.x = -0.5;
    chair.add(back);

    return chair;
  }

  private createSeashell(): THREE.Group {
    const shell = new THREE.Group();

    const shellGeometry = new THREE.SphereGeometry(0.5, 8, 6, 0, Math.PI);
    const shellMaterial = new THREE.MeshStandardMaterial({
      color: 0xffefd5,
      roughness: 0.6,
      metalness: 0.2
    });
    const shellMesh = new THREE.Mesh(shellGeometry, shellMaterial);
    shellMesh.rotation.x = -Math.PI / 2;
    shell.add(shellMesh);

    return shell;
  }

  private createBeachBall(): THREE.Group {
    const ball = new THREE.Group();

    const ballGeometry = new THREE.SphereGeometry(0.4, 16, 16);
    const ballMaterial = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      roughness: 0.5,
      metalness: 0.1
    });
    const ballMesh = new THREE.Mesh(ballGeometry, ballMaterial);
    ball.add(ballMesh);

    // Stripes
    const colors = [0xffffff, 0x0000ff, 0xffff00];
    for (let i = 0; i < 3; i++) {
      const stripeGeometry = new THREE.SphereGeometry(0.41, 16, 16, 
        (i * 2 * Math.PI) / 6, Math.PI / 6);
      const stripeMaterial = new THREE.MeshStandardMaterial({
        color: colors[i],
        roughness: 0.5,
        metalness: 0.1
      });
      const stripe = new THREE.Mesh(stripeGeometry, stripeMaterial);
      ball.add(stripe);
    }

    return ball;
  }

  private createSurfboard(): THREE.Group {
    const board = new THREE.Group();

    // Main board shape
    const boardShape = new THREE.Shape();
    boardShape.moveTo(0, -1.5);
    boardShape.quadraticCurveTo(0.4, -1, 0.4, 0);
    boardShape.quadraticCurveTo(0.4, 1, 0, 1.5);
    boardShape.quadraticCurveTo(-0.4, 1, -0.4, 0);
    boardShape.quadraticCurveTo(-0.4, -1, 0, -1.5);

    const extrudeSettings = {
      steps: 1,
      depth: 0.1,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 3
    };

    const boardGeometry = new THREE.ExtrudeGeometry(boardShape, extrudeSettings);
    const boardMaterial = new THREE.MeshStandardMaterial({
      color: 0x00bfff,
      roughness: 0.3,
      metalness: 0.1
    });
    const boardMesh = new THREE.Mesh(boardGeometry, boardMaterial);
    boardMesh.rotation.x = Math.PI / 2;
    board.add(boardMesh);

    // Stripe
    const stripeGeometry = new THREE.BoxGeometry(0.6, 0.02, 0.5);
    const stripeMaterial = new THREE.MeshStandardMaterial({
      color: 0xff6600,
      roughness: 0.3,
      metalness: 0.1
    });
    const stripe = new THREE.Mesh(stripeGeometry, stripeMaterial);
    stripe.position.y = 0.07;
    board.add(stripe);

    return board;
  }

  private createCloud(): THREE.Group {
    const cloud = new THREE.Group();

    const cloudMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0.9
    });

    // Multiple spheres to form cloud
    const positions = [
      { x: 0, y: 0, z: 0, r: 1 },
      { x: 1, y: 0.2, z: 0, r: 0.8 },
      { x: -1, y: 0.1, z: 0, r: 0.9 },
      { x: 0.5, y: 0.5, z: 0, r: 0.6 },
      { x: -0.5, y: 0.4, z: 0.2, r: 0.7 }
    ];

    positions.forEach(pos => {
      const sphereGeometry = new THREE.SphereGeometry(pos.r);
      const sphere = new THREE.Mesh(sphereGeometry, cloudMaterial);
      sphere.position.set(pos.x, pos.y, pos.z);
      cloud.add(sphere);
    });

    return cloud;
  }

  public dispose(): void {
    if (this.stageElements) {
      this.scene.remove(this.stageElements.group);
      this.stageElements.dispose();
      this.stageElements = null;
    }
  }
}
