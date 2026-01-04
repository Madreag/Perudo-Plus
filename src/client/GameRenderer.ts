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

// Bounding radius for each die type (used for collision detection)
// These values represent the approximate radius of each die shape plus a small buffer
const DICE_BOUNDING_RADIUS: Record<DieType, number> = {
  'd3': 0.55,   // CylinderGeometry radius 0.5 + buffer
  'd4': 0.65,   // TetrahedronGeometry radius 0.6 + buffer
  'd6': 0.60,   // BoxGeometry 0.8 -> half-diagonal ~0.57 + buffer
  'd8': 0.65,   // OctahedronGeometry radius 0.6 + buffer
  'd10': 0.55   // DodecahedronGeometry radius 0.5 + buffer
};



export class GameRenderer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private container: HTMLElement;
  private diceObjects: Map<string, THREE.Mesh> = new Map();
  private tableGroup: THREE.Group;
  private cardDeckGroup!: THREE.Group;
  private playerPositions: THREE.Vector3[] = [];
  private animationFrameId: number = 0;
  private isAnimating: boolean = false;

  // Camera orbit controls
  private cameraTheta: number = -Math.PI / 2;  // Horizontal angle (start behind player 0, looking at center)
  private cameraPhi: number = Math.PI / 3;    // Vertical angle (60 degrees from top)
  private cameraRadius: number = 18;          // Distance from center
  private cameraTarget: THREE.Vector3 = new THREE.Vector3(0, 0, 0);  // Look at center of table
  
  // Mouse control state
  private isDragging: boolean = false;
  private previousMouseX: number = 0;
  private previousMouseY: number = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    
    // Initialize Three.js scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);

    // Camera setup
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    
    // Initialize camera position from orbit parameters
    this.updateCameraPosition();

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
    this.createCardDeck();
    this.setupPlayerPositions();

    // Handle window resize
    window.addEventListener('resize', () => this.onWindowResize());

    // Setup camera controls
    this.setupCameraControls();

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

  private createCardDeck(): void {
    // Create a group to hold the card deck
    this.cardDeckGroup = new THREE.Group();
    
    // Card dimensions (roughly poker card proportions)
    const cardWidth = 1.0;
    const cardHeight = 1.4;
    const cardThickness = 0.015;
    const numCards = 20; // Visual representation of deck thickness
    
    // Colors inspired by the 2D design
    const cardBackColor = 0x1a3050;  // Dark blue
    const cardEdgeColor = 0x4a7a9a;  // Lighter blue for edges
    const accentColor = 0x2a4a6a;    // Medium blue
    
    // Create the main deck body (single box for performance)
    const deckHeight = numCards * cardThickness;
    const deckBodyGeometry = new THREE.BoxGeometry(cardWidth, deckHeight, cardHeight);
    const deckBodyMaterial = new THREE.MeshStandardMaterial({
      color: cardBackColor,
      roughness: 0.4,
      metalness: 0.1
    });
    const deckBody = new THREE.Mesh(deckBodyGeometry, deckBodyMaterial);
    deckBody.position.y = deckHeight / 2;
    deckBody.castShadow = true;
    deckBody.receiveShadow = true;
    this.cardDeckGroup.add(deckBody);
    
    // Add edge trim around the deck (like a border)
    const edgeThickness = 0.03;
    const edgeMaterial = new THREE.MeshStandardMaterial({
      color: cardEdgeColor,
      roughness: 0.3,
      metalness: 0.3,
      emissive: cardEdgeColor,
      emissiveIntensity: 0.1
    });
    
    // Front edge
    const frontEdgeGeometry = new THREE.BoxGeometry(cardWidth + 0.02, deckHeight, edgeThickness);
    const frontEdge = new THREE.Mesh(frontEdgeGeometry, edgeMaterial);
    frontEdge.position.set(0, deckHeight / 2, cardHeight / 2 + edgeThickness / 2);
    this.cardDeckGroup.add(frontEdge);
    
    // Back edge
    const backEdge = new THREE.Mesh(frontEdgeGeometry, edgeMaterial);
    backEdge.position.set(0, deckHeight / 2, -cardHeight / 2 - edgeThickness / 2);
    this.cardDeckGroup.add(backEdge);
    
    // Left edge
    const sideEdgeGeometry = new THREE.BoxGeometry(edgeThickness, deckHeight, cardHeight + 0.02);
    const leftEdge = new THREE.Mesh(sideEdgeGeometry, edgeMaterial);
    leftEdge.position.set(-cardWidth / 2 - edgeThickness / 2, deckHeight / 2, 0);
    this.cardDeckGroup.add(leftEdge);
    
    // Right edge
    const rightEdge = new THREE.Mesh(sideEdgeGeometry, edgeMaterial);
    rightEdge.position.set(cardWidth / 2 + edgeThickness / 2, deckHeight / 2, 0);
    this.cardDeckGroup.add(rightEdge);
    
    // Add a top card with decorative design
    const topCardGeometry = new THREE.BoxGeometry(cardWidth, cardThickness * 2, cardHeight);
    const topCardMaterial = new THREE.MeshStandardMaterial({
      color: accentColor,
      roughness: 0.2,
      metalness: 0.2
    });
    const topCard = new THREE.Mesh(topCardGeometry, topCardMaterial);
    topCard.position.y = deckHeight + cardThickness;
    topCard.castShadow = true;
    this.cardDeckGroup.add(topCard);
    
    // Inner border on top card
    const innerBorderShape = new THREE.Shape();
    const borderInset = 0.08;
    const borderWidth = 0.03;
    // Outer rectangle
    innerBorderShape.moveTo(-cardWidth/2 + borderInset, -cardHeight/2 + borderInset);
    innerBorderShape.lineTo(cardWidth/2 - borderInset, -cardHeight/2 + borderInset);
    innerBorderShape.lineTo(cardWidth/2 - borderInset, cardHeight/2 - borderInset);
    innerBorderShape.lineTo(-cardWidth/2 + borderInset, cardHeight/2 - borderInset);
    innerBorderShape.closePath();
    // Inner rectangle (hole)
    const holePath = new THREE.Path();
    holePath.moveTo(-cardWidth/2 + borderInset + borderWidth, -cardHeight/2 + borderInset + borderWidth);
    holePath.lineTo(cardWidth/2 - borderInset - borderWidth, -cardHeight/2 + borderInset + borderWidth);
    holePath.lineTo(cardWidth/2 - borderInset - borderWidth, cardHeight/2 - borderInset - borderWidth);
    holePath.lineTo(-cardWidth/2 + borderInset + borderWidth, cardHeight/2 - borderInset - borderWidth);
    holePath.closePath();
    innerBorderShape.holes.push(holePath);
    
    const innerBorderGeometry = new THREE.ShapeGeometry(innerBorderShape);
    const innerBorderMaterial = new THREE.MeshStandardMaterial({
      color: 0x6a9aba,
      roughness: 0.3,
      metalness: 0.4,
      side: THREE.DoubleSide
    });
    const innerBorder = new THREE.Mesh(innerBorderGeometry, innerBorderMaterial);
    innerBorder.rotation.x = -Math.PI / 2;
    innerBorder.position.y = deckHeight + cardThickness * 2 + 0.001;
    this.cardDeckGroup.add(innerBorder);
    
    // Add a decorative diamond pattern in the center
    const diamondShape = new THREE.Shape();
    diamondShape.moveTo(0, 0.35);
    diamondShape.lineTo(0.2, 0);
    diamondShape.lineTo(0, -0.35);
    diamondShape.lineTo(-0.2, 0);
    diamondShape.closePath();
    
    const diamondGeometry = new THREE.ShapeGeometry(diamondShape);
    const diamondMaterial = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      roughness: 0.2,
      metalness: 0.6,
      emissive: 0xffd700,
      emissiveIntensity: 0.15,
      side: THREE.DoubleSide
    });
    const diamond = new THREE.Mesh(diamondGeometry, diamondMaterial);
    diamond.rotation.x = -Math.PI / 2;
    diamond.position.y = deckHeight + cardThickness * 2 + 0.002;
    this.cardDeckGroup.add(diamond);
    
    // Add smaller diamonds in corners
    const smallDiamondShape = new THREE.Shape();
    smallDiamondShape.moveTo(0, 0.1);
    smallDiamondShape.lineTo(0.06, 0);
    smallDiamondShape.lineTo(0, -0.1);
    smallDiamondShape.lineTo(-0.06, 0);
    smallDiamondShape.closePath();
    
    const smallDiamondGeometry = new THREE.ShapeGeometry(smallDiamondShape);
    const smallDiamondMaterial = new THREE.MeshStandardMaterial({
      color: 0xc0c0c0,
      roughness: 0.3,
      metalness: 0.5,
      side: THREE.DoubleSide
    });
    
    const cornerPositions = [
      { x: -cardWidth/2 + 0.18, z: -cardHeight/2 + 0.22 },
      { x: cardWidth/2 - 0.18, z: -cardHeight/2 + 0.22 },
      { x: -cardWidth/2 + 0.18, z: cardHeight/2 - 0.22 },
      { x: cardWidth/2 - 0.18, z: cardHeight/2 - 0.22 }
    ];
    
    cornerPositions.forEach(pos => {
      const smallDiamond = new THREE.Mesh(smallDiamondGeometry, smallDiamondMaterial);
      smallDiamond.rotation.x = -Math.PI / 2;
      smallDiamond.position.set(pos.x, deckHeight + cardThickness * 2 + 0.002, pos.z);
      this.cardDeckGroup.add(smallDiamond);
    });
    
    // Add a subtle glow underneath the deck
    const glowGeometry = new THREE.CircleGeometry(0.9, 32);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x4a7a9a,
      transparent: true,
      opacity: 0.15
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.005;
    this.cardDeckGroup.add(glow);
    
    // Position the deck at the center of the table
    this.cardDeckGroup.position.set(0, 0.01, 0); // Slightly above table surface
    
    // Add the deck to the table group
    this.tableGroup.add(this.cardDeckGroup);
  }


  /**
   * Update the visual representation of the card deck based on remaining cards
   * @param remainingCards Number of cards remaining in the deck
   * @param totalCards Total number of cards in a full deck (default 28)
   */
  public updateDeckCount(remainingCards: number, totalCards: number = 28): void {
    if (!this.cardDeckGroup) return;
    
    // Calculate the scale factor based on remaining cards
    const minScale = 0.2; // Minimum scale when deck is nearly empty
    const scaleFactor = Math.max(minScale, remainingCards / totalCards);
    
    // Scale the deck height (y-axis) to show fewer cards
    this.cardDeckGroup.scale.y = scaleFactor;
    
    // Adjust position to keep deck on table surface
    this.cardDeckGroup.position.y = 0.01;
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

  // Update camera position based on spherical coordinates
  private updateCameraPosition(): void {
    // Convert spherical coordinates to Cartesian
    // phi is the angle from the vertical (0 = top, PI = bottom)
    // theta is the horizontal angle (matching player position formula)
    // Player positions use: x = cos(angle) * radius, z = sin(angle) * radius
    // So camera should use the same convention
    const horizontalRadius = this.cameraRadius * Math.sin(this.cameraPhi);
    const x = Math.cos(this.cameraTheta) * horizontalRadius;
    const y = this.cameraRadius * Math.cos(this.cameraPhi);
    const z = Math.sin(this.cameraTheta) * horizontalRadius;
    
    this.camera.position.set(
      this.cameraTarget.x + x,
      this.cameraTarget.y + y,
      this.cameraTarget.z + z
    );
    this.camera.lookAt(this.cameraTarget);
  }

  // Setup mouse and scroll controls for camera
  private setupCameraControls(): void {
    const canvas = this.renderer.domElement;
    
    // Mouse down - start dragging
    canvas.addEventListener('mousedown', (event: MouseEvent) => {
      this.isDragging = true;
      this.previousMouseX = event.clientX;
      this.previousMouseY = event.clientY;
    });
    
    // Mouse move - rotate camera if dragging
    canvas.addEventListener('mousemove', (event: MouseEvent) => {
      if (!this.isDragging) return;
      
      const deltaX = event.clientX - this.previousMouseX;
      const deltaY = event.clientY - this.previousMouseY;
      
      // Adjust rotation speed
      const rotationSpeed = 0.005;
      
      // Update theta (horizontal rotation)
      this.cameraTheta += deltaX * rotationSpeed;
      
      // Update phi (vertical rotation) with limits
      this.cameraPhi -= deltaY * rotationSpeed;
      // Clamp phi to prevent flipping (between 10 and 80 degrees from vertical)
      this.cameraPhi = Math.max(0.1, Math.min(Math.PI * 0.45, this.cameraPhi));
      
      this.previousMouseX = event.clientX;
      this.previousMouseY = event.clientY;
      
      this.updateCameraPosition();
    });
    
    // Mouse up - stop dragging
    canvas.addEventListener('mouseup', () => {
      this.isDragging = false;
    });
    
    // Mouse leave - stop dragging
    canvas.addEventListener('mouseleave', () => {
      this.isDragging = false;
    });
    
    // Scroll wheel - zoom in/out
    canvas.addEventListener('wheel', (event: WheelEvent) => {
      event.preventDefault();
      
      // Adjust zoom speed
      const zoomSpeed = 0.001;
      
      // Update radius (zoom)
      this.cameraRadius += event.deltaY * zoomSpeed * this.cameraRadius;
      
      // Clamp radius to reasonable bounds
      this.cameraRadius = Math.max(8, Math.min(40, this.cameraRadius));
      
      this.updateCameraPosition();
    }, { passive: false });
  }

  // Set camera to view from a specific player's perspective
  public setCameraToPlayerView(playerIndex: number): void {
    // Player positions are arranged around the table
    // Calculate the angle for this player (same formula as setupPlayerPositions)
    const angle = (playerIndex / 5) * Math.PI * 2 - Math.PI / 2;
    
    // Set theta to be behind the player (same direction as player, looking toward center)
    // The camera looks at the center, so we position it on the same side as the player
    this.cameraTheta = angle;
    
    // Reset phi and radius to defaults
    this.cameraPhi = Math.PI / 3;
    this.cameraRadius = 18;
    
    this.updateCameraPosition();
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

  /**
   * Generate random clustered positions for dice, simulating a natural bunch like in Perudo.
   * Uses collision detection based on actual die sizes to prevent overlap.
   * @param diceTypes Array of die types to position (used for collision detection based on die sizes)
   * @param centerX Center X position
   * @param centerZ Center Z position
   * @param baseY Base Y position (height)
   * @returns Array of {x, y, z, rotationY} for each die
   */
  private generateRandomDiceCluster(
    diceTypes: DieType[],
    centerX: number,
    centerZ: number,
    baseY: number
  ): Array<{ x: number; y: number; z: number; rotationY: number }> {
    const positions: Array<{ x: number; y: number; z: number; rotationY: number; boundingRadius: number }> = [];
    const count = diceTypes.length;
    
    // Calculate the total area needed based on dice sizes
    // Sum of all dice diameters gives us an estimate of the space needed
    const totalDiceArea = diceTypes.reduce((sum, type) => {
      const radius = DICE_BOUNDING_RADIUS[type];
      return sum + Math.PI * radius * radius;
    }, 0);
    
    // Calculate spread radius to ensure enough space for all dice
    // Add extra padding for natural spacing
    const avgRadius = diceTypes.reduce((sum, type) => sum + DICE_BOUNDING_RADIUS[type], 0) / count;
    const baseSpread = Math.sqrt(totalDiceArea / Math.PI) * 1.2; // 20% extra space
    const minSpread = avgRadius * 2; // At minimum, spread should be twice the average radius
    const maxSpread = Math.max(baseSpread, minSpread, 0.8 + 0.2 * count);
    
    for (let i = 0; i < count; i++) {
      let x: number = centerX;
      let z: number = centerZ;
      let attempts = 0;
      const maxAttempts = 100; // Increased attempts for better placement
      
      // Get the bounding radius for the current die type
      const currentDieRadius = DICE_BOUNDING_RADIUS[diceTypes[i]];
      
      // Try to find a position that doesn't overlap with existing dice
      let placed = false;
      do {
        // Generate random position in a roughly circular area
        // Use a combination of angle and radius for natural distribution
        const angle = Math.random() * Math.PI * 2;
        // Use square root for more uniform distribution in circle
        const radius = Math.sqrt(Math.random()) * maxSpread;
        
        x = centerX + Math.cos(angle) * radius + (Math.random() - 0.5) * 0.2;
        z = centerZ + Math.sin(angle) * radius + (Math.random() - 0.5) * 0.2;
        
        attempts++;
        
        // Check distance from existing positions using actual die bounding radii
        let tooClose = false;
        for (const pos of positions) {
          const dist = Math.sqrt((x - pos.x) ** 2 + (z - pos.z) ** 2);
          // Minimum distance is the sum of both dice bounding radii
          const minDistance = currentDieRadius + pos.boundingRadius;
          if (dist < minDistance) {
            tooClose = true;
            break;
          }
        }
        
        if (!tooClose) {
          placed = true;
          break;
        }
      } while (attempts < maxAttempts);
      
      // If we couldn't find a non-overlapping position, use a spiral placement as fallback
      if (!placed) {
        // Place in a spiral pattern to guarantee no overlap
        const spiralAngle = (i / count) * Math.PI * 2;
        const spiralRadius = currentDieRadius + (i > 0 ? positions.reduce((max, pos) => 
          Math.max(max, Math.sqrt((pos.x - centerX) ** 2 + (pos.z - centerZ) ** 2) + pos.boundingRadius), 0) : 0);
        
        x = centerX + Math.cos(spiralAngle) * (spiralRadius + currentDieRadius);
        z = centerZ + Math.sin(spiralAngle) * (spiralRadius + currentDieRadius);
      }
      
      positions.push({
        x,
        y: baseY,
        z,
        rotationY: Math.random() * Math.PI * 2, // Random rotation for natural look
        boundingRadius: currentDieRadius
      });
    }
    
    // Return positions without the boundingRadius (not needed by callers)
    return positions.map(({ x, y, z, rotationY }) => ({ x, y, z, rotationY }));
  }



  public renderPlayerDice(dice: Die[], playerIndex: number): void {
    const position = this.playerPositions[playerIndex];
    if (!position) return;

    // Clear existing dice for this player
    this.clearPlayerDice(playerIndex);

    // Generate random clustered positions for a natural bunch look (like Perudo)
    const clusterPositions = this.generateRandomDiceCluster(
      dice.map(d => d.type),
      position.x,
      position.z,
      position.y
    );

    // Arrange dice in a natural random cluster
    dice.forEach((die, i) => {
      const mesh = this.createDieMesh(die);
      const clusterPos = clusterPositions[i];
      
      // Position dice using the random cluster positions
      mesh.position.set(clusterPos.x, clusterPos.y, clusterPos.z);
      
      // Random rotation for visual interest
      mesh.rotation.set(
        Math.random() * 0.2,
        clusterPos.rotationY,
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

      // Generate random clustered target positions for a natural bunch look (like Perudo)
      const clusterPositions = this.generateRandomDiceCluster(
        dice.map(d => d.type),
        position.x,
        position.z,
        position.y
      );

      const meshes: THREE.Mesh[] = [];
      const startPositions: THREE.Vector3[] = [];
      const targetPositions: THREE.Vector3[] = [];
      const rotationSpeeds: THREE.Vector3[] = [];
      const targetRotations: THREE.Vector3[] = [];

      dice.forEach((die, i) => {
        const mesh = this.createDieMesh(die);
        const clusterPos = clusterPositions[i];
        
        // Start position (above table, scattered around the target area)
        const startPos = new THREE.Vector3(
          clusterPos.x + (Math.random() - 0.5) * 1.5,
          5 + Math.random() * 2,
          clusterPos.z + (Math.random() - 0.5) * 1.5
        );
        
        // Target position from the random cluster
        const targetPos = new THREE.Vector3(
          clusterPos.x,
          clusterPos.y,
          clusterPos.z
        );

        mesh.position.copy(startPos);
        startPositions.push(startPos);
        targetPositions.push(targetPos);
        rotationSpeeds.push(new THREE.Vector3(
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10
        ));
        // Store target rotation for natural final orientation
        targetRotations.push(new THREE.Vector3(
          Math.random() * 0.2,
          clusterPos.rotationY,
          Math.random() * 0.2
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
          } else {
            // Set final rotation for natural look
            mesh.rotation.x = targetRotations[i].x;
            mesh.rotation.y = targetRotations[i].y;
            mesh.rotation.z = targetRotations[i].z;
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

      // Generate random clustered target positions for a natural bunch look (like Perudo)
      const clusterPositions = this.generateRandomDiceCluster(
        Array(diceCount).fill('d6' as DieType),
        position.x,
        position.z,
        position.y
      );

      const meshes: THREE.Mesh[] = [];
      const startPositions: THREE.Vector3[] = [];
      const targetPositions: THREE.Vector3[] = [];
      const rotationSpeeds: THREE.Vector3[] = [];
      const targetRotations: THREE.Vector3[] = [];

      for (let i = 0; i < diceCount; i++) {
        const mesh = this.createShadowDieMesh();
        const clusterPos = clusterPositions[i];
        
        // Start position (above table, scattered around the target area)
        const startPos = new THREE.Vector3(
          clusterPos.x + (Math.random() - 0.5) * 1.5,
          5 + Math.random() * 2,
          clusterPos.z + (Math.random() - 0.5) * 1.5
        );
        
        // Target position from the random cluster
        const targetPos = new THREE.Vector3(
          clusterPos.x,
          clusterPos.y,
          clusterPos.z
        );

        mesh.position.copy(startPos);
        startPositions.push(startPos);
        targetPositions.push(targetPos);
        rotationSpeeds.push(new THREE.Vector3(
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10
        ));
        // Store target rotation for natural final orientation
        targetRotations.push(new THREE.Vector3(
          Math.random() * 0.2,
          clusterPos.rotationY,
          Math.random() * 0.2
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
          } else {
            // Set final rotation for natural look
            mesh.rotation.x = targetRotations[i].x;
            mesh.rotation.y = targetRotations[i].y;
            mesh.rotation.z = targetRotations[i].z;
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
    
    // Render the scene (camera position is controlled by mouse/scroll)
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
