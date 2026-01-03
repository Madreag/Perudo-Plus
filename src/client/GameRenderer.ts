// ============================================
// Perudo+ Three.js Game Renderer
// ============================================

import * as THREE from 'three';
import { Die, DieType, PublicPlayerInfo, Bid } from '../shared/types';

// Dice geometry configurations
const DICE_COLORS: Record<DieType, number> = {
  'd3': 0xff6b6b,  // Red
  'd4': 0x4ecdc4,  // Teal
  'd6': 0xffe66d,  // Yellow
  'd8': 0x95e1d3,  // Mint
  'd10': 0xdda0dd  // Plum
};

export class GameRenderer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private container: HTMLElement;
  private diceObjects: Map<string, THREE.Mesh> = new Map();
  private tableGroup: THREE.Group;
  private playerPositions: THREE.Vector3[] = [];
  private animationFrameId: number = 0;
  private isAnimating: boolean = false;

  constructor(container: HTMLElement) {
    this.container = container;
    
    // Initialize Three.js scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);

    // Camera setup
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    this.camera.position.set(0, 15, 12);
    this.camera.lookAt(0, 0, 0);

    // Renderer setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // Create table group
    this.tableGroup = new THREE.Group();
    this.scene.add(this.tableGroup);

    // Setup scene
    this.setupLighting();
    this.createTable();
    this.setupPlayerPositions();

    // Handle window resize
    window.addEventListener('resize', () => this.onWindowResize());

    // Start render loop
    this.animate();
  }

  private setupLighting(): void {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    // Main directional light
    const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
    mainLight.position.set(10, 20, 10);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.camera.near = 0.5;
    mainLight.shadow.camera.far = 50;
    mainLight.shadow.camera.left = -15;
    mainLight.shadow.camera.right = 15;
    mainLight.shadow.camera.top = 15;
    mainLight.shadow.camera.bottom = -15;
    this.scene.add(mainLight);

    // Fill light
    const fillLight = new THREE.DirectionalLight(0x4a90d9, 0.3);
    fillLight.position.set(-10, 10, -10);
    this.scene.add(fillLight);

    // Rim light
    const rimLight = new THREE.DirectionalLight(0xff6b6b, 0.2);
    rimLight.position.set(0, 5, -15);
    this.scene.add(rimLight);
  }

  private createTable(): void {
    // Table top (circular)
    const tableGeometry = new THREE.CylinderGeometry(10, 10, 0.5, 64);
    const tableMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d5a27,
      roughness: 0.8,
      metalness: 0.1
    });
    const table = new THREE.Mesh(tableGeometry, tableMaterial);
    table.position.y = -0.25;
    table.receiveShadow = true;
    this.tableGroup.add(table);

    // Table rim
    const rimGeometry = new THREE.TorusGeometry(10, 0.3, 16, 64);
    const rimMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a3728,
      roughness: 0.6,
      metalness: 0.2
    });
    const rim = new THREE.Mesh(rimGeometry, rimMaterial);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0;
    this.tableGroup.add(rim);

    // Felt texture pattern (subtle)
    const feltPattern = new THREE.RingGeometry(0.5, 9.5, 64);
    const feltMaterial = new THREE.MeshStandardMaterial({
      color: 0x3d6a37,
      roughness: 0.9,
      metalness: 0,
      transparent: true,
      opacity: 0.3
    });
    const felt = new THREE.Mesh(feltPattern, feltMaterial);
    felt.rotation.x = -Math.PI / 2;
    felt.position.y = 0.01;
    this.tableGroup.add(felt);
  }

  private setupPlayerPositions(): void {
    // Positions around the table for up to 5 players
    const radius = 7;
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
      this.playerPositions.push(new THREE.Vector3(
        Math.cos(angle) * radius,
        0.5,
        Math.sin(angle) * radius
      ));
    }
  }

  private createDieGeometry(type: DieType): THREE.BufferGeometry {
    switch (type) {
      case 'd3':
        // Triangular prism (3-sided die)
        return this.createD3Geometry();
      case 'd4':
        // Tetrahedron
        return new THREE.TetrahedronGeometry(0.6);
      case 'd6':
        // Cube
        return new THREE.BoxGeometry(0.8, 0.8, 0.8);
      case 'd8':
        // Octahedron
        return new THREE.OctahedronGeometry(0.6);
      case 'd10':
        // Pentagonal trapezohedron (approximated with custom geometry)
        return this.createD10Geometry();
      default:
        return new THREE.BoxGeometry(0.8, 0.8, 0.8);
    }
  }

  private createD3Geometry(): THREE.BufferGeometry {
    // Create a triangular prism for d3
    const geometry = new THREE.CylinderGeometry(0.5, 0.5, 0.8, 3);
    return geometry;
  }

  private createD10Geometry(): THREE.BufferGeometry {
    // Create a pentagonal trapezohedron approximation
    const geometry = new THREE.ConeGeometry(0.5, 1, 5);
    // Duplicate and flip for bottom half
    const topHalf = geometry.clone();
    
    // For simplicity, use a dodecahedron as approximation
    return new THREE.DodecahedronGeometry(0.5);
  }

  private createDieMesh(die: Die): THREE.Mesh {
    const geometry = this.createDieGeometry(die.type);
    
    let mesh: THREE.Mesh;
    
    if (die.type === 'd6') {
      // For d6, create materials for each face with the number on top face
      const materials = this.createD6Materials(die);
      mesh = new THREE.Mesh(geometry, materials);
    } else if (die.type === 'd3') {
      // For d3, create materials for each face to ensure numbers are visible
      const materials = this.createD3Materials(die);
      mesh = new THREE.Mesh(geometry, materials);
    } else {
      // For other dice types, use a single material with the number texture
      const material = this.createDieMaterialWithNumber(die);
      mesh = new THREE.Mesh(geometry, material);
    }
    
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    return mesh;
  }

  private createNumberTexture(value: number, bgColor: number, dieType: DieType = 'd6'): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');

    // Fill background with dice color
    ctx.fillStyle = '#' + bgColor.toString(16).padStart(6, '0');
    ctx.fillRect(0, 0, 128, 128);

    // Adjust font size and position based on die type
    // For triangular faces (d4, d8), the UV mapping requires different positioning
    let fontSize = 80;
    let textX = 64;
    let textY = 64;
    let outlineWidth = 4;
    let textColor = 'white';
    let outlineColor = 'black';

    if (dieType === 'd4') {
      // Tetrahedron has triangular faces
      // The UV mapping places the visible triangle with vertices roughly at
      // (0,0), (1,0), (0.5,1) - so center the number in the lower-middle area
      fontSize = 40;
      textX = 64;
      textY = 45;
    } else if (dieType === 'd8') {
      // Octahedron has triangular faces - similar to d4
      fontSize = 40;
      textX = 64;
      textY = 45;
    } else if (dieType === 'd3') {
      // Triangular prism - rectangular faces on sides, triangular on top/bottom
      // Use larger font and better contrast for visibility
      fontSize = 72;
      textX = 64;
      textY = 64;
      outlineWidth = 6;
      // Use dark text with light outline for better contrast on red background
      textColor = '#1a1a2e';
      outlineColor = 'white';
    }

    // Draw number with outline for better visibility
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Draw shadow for extra depth (especially helpful for d3)
    if (dieType === 'd3') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillText(value.toString(), textX + 3, textY + 3);
    }
    
    // Draw outline
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = outlineWidth;
    ctx.strokeText(value.toString(), textX, textY);
    
    // Draw fill
    ctx.fillStyle = textColor;
    ctx.fillText(value.toString(), textX, textY);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  private createD6Materials(die: Die): THREE.MeshStandardMaterial[] {
    const baseColor = DICE_COLORS[die.type];
    const materials: THREE.MeshStandardMaterial[] = [];
    
    // D6 face order in Three.js BoxGeometry: +X, -X, +Y, -Y, +Z, -Z
    // Show the face value on all faces for better visibility
    const texture = this.createNumberTexture(die.faceValue, baseColor, die.type);
    
    for (let i = 0; i < 6; i++) {
      materials.push(new THREE.MeshStandardMaterial({
        map: texture.clone(),
        roughness: 0.3,
        metalness: 0.1
      }));
    }
    
    return materials;
  }

  private createD3Materials(die: Die): THREE.MeshStandardMaterial[] {
    const baseColor = DICE_COLORS[die.type];
    const materials: THREE.MeshStandardMaterial[] = [];
    
    // CylinderGeometry with 3 radial segments creates a triangular prism
    // It has 3 material groups: sides (0), top cap (1), bottom cap (2)
    // We need to apply the number texture to all faces for visibility
    const texture = this.createNumberTexture(die.faceValue, baseColor, die.type);
    
    // Material for the 3 rectangular side faces
    materials.push(new THREE.MeshStandardMaterial({
      map: texture.clone(),
      roughness: 0.3,
      metalness: 0.1
    }));
    
    // Material for top cap (triangular)
    materials.push(new THREE.MeshStandardMaterial({
      map: texture.clone(),
      roughness: 0.3,
      metalness: 0.1
    }));
    
    // Material for bottom cap (triangular)
    materials.push(new THREE.MeshStandardMaterial({
      map: texture.clone(),
      roughness: 0.3,
      metalness: 0.1
    }));
    
    return materials;
  }

  private createDieMaterialWithNumber(die: Die): THREE.MeshStandardMaterial {
    const baseColor = DICE_COLORS[die.type];
    const texture = this.createNumberTexture(die.faceValue, baseColor, die.type);
    
    return new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.3,
      metalness: 0.1
    });
  }

  public renderPlayerDice(dice: Die[], playerIndex: number): void {
    const position = this.playerPositions[playerIndex];
    if (!position) return;

    // Clear existing dice for this player
    this.clearPlayerDice(playerIndex);

    // Arrange dice in a small cluster
    dice.forEach((die, i) => {
      const mesh = this.createDieMesh(die);
      
      // Position dice in a row
      const offsetX = (i - (dice.length - 1) / 2) * 1.2;
      mesh.position.set(
        position.x + offsetX * 1.0,
        position.y,
        position.z
      );
      
      // Random rotation for visual interest
      mesh.rotation.set(
        Math.random() * 0.2,
        Math.random() * Math.PI * 2,
        Math.random() * 0.2
      );

      mesh.userData = { dieId: die.id, playerIndex };
      this.diceObjects.set(`${playerIndex}-${die.id}`, mesh);
      this.scene.add(mesh);
    });
  }

  private clearPlayerDice(playerIndex: number): void {
    const toRemove: string[] = [];
    this.diceObjects.forEach((mesh, key) => {
      if (key.startsWith(`${playerIndex}-`)) {
        this.scene.remove(mesh);
        toRemove.push(key);
      }
    });
    toRemove.forEach(key => this.diceObjects.delete(key));
  }

  public animateDiceRoll(dice: Die[], playerIndex: number): Promise<void> {
    return new Promise((resolve) => {
      const position = this.playerPositions[playerIndex];
      if (!position) {
        resolve();
        return;
      }

      this.clearPlayerDice(playerIndex);

      const meshes: THREE.Mesh[] = [];
      const startPositions: THREE.Vector3[] = [];
      const targetPositions: THREE.Vector3[] = [];
      const rotationSpeeds: THREE.Vector3[] = [];

      dice.forEach((die, i) => {
        const mesh = this.createDieMesh(die);
        
        // Calculate offset for this die
        const offsetX = (i - (dice.length - 1) / 2) * 1.2;
        
        // Start position (above table, with slight random variation)
        const startPos = new THREE.Vector3(
          position.x + offsetX * 1.0 + (Math.random() - 0.5) * 0.3,
          5 + Math.random() * 2,
          position.z + (Math.random() - 0.5) * 0.5
        );
        
        // Target position (spread out to avoid overlap)
        const targetPos = new THREE.Vector3(
          position.x + offsetX * 1.0,
          position.y,
          position.z
        );


        mesh.position.copy(startPos);
        startPositions.push(startPos);
        targetPositions.push(targetPos);
        rotationSpeeds.push(new THREE.Vector3(
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10
        ));

        mesh.userData = { dieId: die.id, playerIndex };
        meshes.push(mesh);
        this.diceObjects.set(`${playerIndex}-${die.id}`, mesh);
        this.scene.add(mesh);
      });

      // Animate
      const duration = 1000;
      const startTime = Date.now();

      const animateRoll = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing function (bounce effect)
        const easeOutBounce = (t: number): number => {
          if (t < 1 / 2.75) {
            return 7.5625 * t * t;
          } else if (t < 2 / 2.75) {
            return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
          } else if (t < 2.5 / 2.75) {
            return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
          } else {
            return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
          }
        };

        const easedProgress = easeOutBounce(progress);

        meshes.forEach((mesh, i) => {
          // Interpolate position
          mesh.position.lerpVectors(startPositions[i], targetPositions[i], easedProgress);
          
          // Rotate while falling
          if (progress < 1) {
            mesh.rotation.x += rotationSpeeds[i].x * 0.02 * (1 - progress);
            mesh.rotation.y += rotationSpeeds[i].y * 0.02 * (1 - progress);
            mesh.rotation.z += rotationSpeeds[i].z * 0.02 * (1 - progress);
          }
        });

        if (progress < 1) {
          requestAnimationFrame(animateRoll);
        } else {
          resolve();
        }
      };

      animateRoll();
    });
  }

  public revealAllDice(revealedDice: { playerId: string; dice: Die[] }[], playerIndexMap: Map<string, number>): void {
    // Move all dice to center for reveal
    revealedDice.forEach(({ playerId, dice }) => {
      const playerIndex = playerIndexMap.get(playerId);
      if (playerIndex === undefined) return;

      dice.forEach((die, i) => {
        const key = `${playerIndex}-${die.id}`;
        const mesh = this.diceObjects.get(key);
        if (mesh) {
          // Animate to center
          const angle = (playerIndex / 5) * Math.PI * 2;
          const radius = 2 + i * 0.8;
          const targetX = Math.cos(angle) * radius;
          const targetZ = Math.sin(angle) * radius;
          
          this.animateToPosition(mesh, new THREE.Vector3(targetX, 0.5, targetZ));
        }
      });
    });
  }

  private animateToPosition(mesh: THREE.Mesh, target: THREE.Vector3): void {
    const start = mesh.position.clone();
    const duration = 500;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // Ease out cubic

      mesh.position.lerpVectors(start, target, eased);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    animate();
  }

  // Create a shadow die mesh (d6 shape, dark appearance, no values shown)
  private createShadowDieMesh(): THREE.Mesh {
    // Use d6 geometry for all shadow dice
    const geometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
    
    // Create a dark, shadowy material
    const material = new THREE.MeshStandardMaterial({
      color: 0x2a2a3a,  // Dark gray-blue
      roughness: 0.7,
      metalness: 0.3,
      transparent: true,
      opacity: 0.85
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    return mesh;
  }

  // Animate shadow dice roll for other players (same animation as regular dice)
  public animateShadowDiceRoll(diceCount: number, playerIndex: number): Promise<void> {
    return new Promise((resolve) => {
      const position = this.playerPositions[playerIndex];
      if (!position || diceCount <= 0) {
        resolve();
        return;
      }

      this.clearPlayerDice(playerIndex);

      const meshes: THREE.Mesh[] = [];
      const startPositions: THREE.Vector3[] = [];
      const targetPositions: THREE.Vector3[] = [];
      const rotationSpeeds: THREE.Vector3[] = [];

      for (let i = 0; i < diceCount; i++) {
        const mesh = this.createShadowDieMesh();
        
        // Calculate offset for this die
        const offsetX = (i - (diceCount - 1) / 2) * 1.2;
        
        // Start position (above table, with slight random variation)
        const startPos = new THREE.Vector3(
          position.x + offsetX * 1.0 + (Math.random() - 0.5) * 0.3,
          5 + Math.random() * 2,
          position.z + (Math.random() - 0.5) * 0.5
        );
        
        // Target position (spread out to avoid overlap)
        const targetPos = new THREE.Vector3(
          position.x + offsetX * 1.0,
          position.y,
          position.z
        );

        mesh.position.copy(startPos);
        startPositions.push(startPos);
        targetPositions.push(targetPos);
        rotationSpeeds.push(new THREE.Vector3(
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10
        ));

        // Use a unique key for shadow dice
        const shadowDieId = `shadow-${i}`;
        mesh.userData = { dieId: shadowDieId, playerIndex, isShadow: true };
        meshes.push(mesh);
        this.diceObjects.set(`${playerIndex}-${shadowDieId}`, mesh);
        this.scene.add(mesh);
      }

      // Animate with the same bounce effect as regular dice
      const duration = 1000;
      const startTime = Date.now();

      const animateRoll = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing function (bounce effect) - same as regular dice
        const easeOutBounce = (t: number): number => {
          if (t < 1 / 2.75) {
            return 7.5625 * t * t;
          } else if (t < 2 / 2.75) {
            return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
          } else if (t < 2.5 / 2.75) {
            return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
          } else {
            return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
          }
        };

        const easedProgress = easeOutBounce(progress);

        meshes.forEach((mesh, i) => {
          // Interpolate position
          mesh.position.lerpVectors(startPositions[i], targetPositions[i], easedProgress);
          
          // Rotate while falling
          if (progress < 1) {
            mesh.rotation.x += rotationSpeeds[i].x * 0.02 * (1 - progress);
            mesh.rotation.y += rotationSpeeds[i].y * 0.02 * (1 - progress);
            mesh.rotation.z += rotationSpeeds[i].z * 0.02 * (1 - progress);
          }
        });

        if (progress < 1) {
          requestAnimationFrame(animateRoll);
        } else {
          resolve();
        }
      };

      animateRoll();
    });
  }


  public clearAllDice(): void {
    this.diceObjects.forEach(mesh => {
      this.scene.remove(mesh);
    });
    this.diceObjects.clear();
  }

  private onWindowResize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private animate(): void {
    this.animationFrameId = requestAnimationFrame(() => this.animate());
    
    // Subtle camera movement
    const time = Date.now() * 0.0001;
    this.camera.position.x = Math.sin(time) * 0.5;
    
    this.renderer.render(this.scene, this.camera);
  }

  public dispose(): void {
    cancelAnimationFrame(this.animationFrameId);
    this.clearAllDice();
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
  }

  public getScene(): THREE.Scene {
    return this.scene;
  }

  public getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }
}
