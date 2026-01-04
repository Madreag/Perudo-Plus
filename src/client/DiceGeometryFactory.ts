// ============================================
// Perudo+ Custom Dice Geometry Factory
// ============================================
// This module creates custom geometries for non-cube dice (D3, D4, D8, D10)
// with proper UV mapping for triangular faces to prevent texture distortion.

import * as THREE from 'three';
import { DieType } from '../shared/types';

// UV coordinates for a centered equilateral triangle within a unit square
// This prevents texture stretching on triangular faces
const TRIANGLE_UVS = {
  // Bottom-left, bottom-right, top-center
  bottomLeft: new THREE.Vector2(0.1, 0.1),
  bottomRight: new THREE.Vector2(0.9, 0.1),
  topCenter: new THREE.Vector2(0.5, 0.9),
};

// Alternative triangle UVs for inverted triangles
const TRIANGLE_UVS_INVERTED = {
  topLeft: new THREE.Vector2(0.1, 0.9),
  topRight: new THREE.Vector2(0.9, 0.9),
  bottomCenter: new THREE.Vector2(0.5, 0.1),
};

/**
 * Factory class for creating custom dice geometries with proper UV mapping
 */
export class DiceGeometryFactory {
  
  /**
   * Create geometry for the specified die type
   */
  static createGeometry(type: DieType): THREE.BufferGeometry {
    switch (type) {
      case 'd3':
        return this.createD3Geometry();
      case 'd4':
        return this.createD4Geometry();
      case 'd6':
        return this.createD6Geometry();
      case 'd8':
        return this.createD8Geometry();
      case 'd10':
        return this.createD10Geometry();
      default:
        return this.createD6Geometry();
    }
  }

  /**
   * Create D3 geometry (triangular prism)
   * Has 3 rectangular side faces and 2 triangular end caps
   * Each face gets its own material group
   */
  static createD3Geometry(): THREE.BufferGeometry {
    const radius = 0.5;
    const height = 0.8;
    
    // Create vertices for a triangular prism
    // Top triangle vertices (y = height/2)
    const topVertices: THREE.Vector3[] = [];
    // Bottom triangle vertices (y = -height/2)
    const bottomVertices: THREE.Vector3[] = [];
    
    for (let i = 0; i < 3; i++) {
      const angle = (i * 2 * Math.PI) / 3 - Math.PI / 2; // Start from top
      const x = radius * Math.cos(angle);
      const z = radius * Math.sin(angle);
      topVertices.push(new THREE.Vector3(x, height / 2, z));
      bottomVertices.push(new THREE.Vector3(x, -height / 2, z));
    }

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const groups: { start: number; count: number; materialIndex: number }[] = [];
    
    let vertexIndex = 0;

    // Create 3 rectangular side faces (each split into 2 triangles)
    // Winding order must be CCW when viewed from outside
    for (let i = 0; i < 3; i++) {
      const next = (i + 1) % 3;
      
      const t0 = topVertices[i];
      const t1 = topVertices[next];
      const b0 = bottomVertices[i];
      const b1 = bottomVertices[next];
      
      // Calculate face normal (pointing outward)
      // For CCW winding, normal = (v1 - v0) x (v2 - v0)
      // We want the normal to point outward from the prism center
      const edge1 = new THREE.Vector3().subVectors(b0, t0);
      const edge2 = new THREE.Vector3().subVectors(t1, t0);
      const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
      
      // First triangle: t0, t1, b0 (CCW when viewed from outside)
      positions.push(t0.x, t0.y, t0.z);
      positions.push(t1.x, t1.y, t1.z);
      positions.push(b0.x, b0.y, b0.z);
      
      // Second triangle: t1, b1, b0 (CCW when viewed from outside)
      positions.push(t1.x, t1.y, t1.z);
      positions.push(b1.x, b1.y, b1.z);
      positions.push(b0.x, b0.y, b0.z);
      
      // Normals for both triangles
      for (let j = 0; j < 6; j++) {
        normals.push(normal.x, normal.y, normal.z);
      }
      
      // UVs for rectangular face
      uvs.push(0, 1); // t0
      uvs.push(1, 1); // t1
      uvs.push(0, 0); // b0
      
      uvs.push(1, 1); // t1
      uvs.push(1, 0); // b1
      uvs.push(0, 0); // b0
      
      // Material group for this face
      groups.push({ start: vertexIndex, count: 6, materialIndex: i });
      vertexIndex += 6;
    }

    // Top cap (triangular face) - material index 3
    // CCW winding when viewed from above (positive Y)
    // Vertices should go counter-clockwise when looking down at the top
    const topNormal = new THREE.Vector3(0, 1, 0);
    positions.push(topVertices[0].x, topVertices[0].y, topVertices[0].z);
    positions.push(topVertices[2].x, topVertices[2].y, topVertices[2].z);
    positions.push(topVertices[1].x, topVertices[1].y, topVertices[1].z);
    
    for (let j = 0; j < 3; j++) {
      normals.push(topNormal.x, topNormal.y, topNormal.z);
    }
    
    // Triangular UV mapping for top cap
    uvs.push(TRIANGLE_UVS.bottomLeft.x, TRIANGLE_UVS.bottomLeft.y);
    uvs.push(TRIANGLE_UVS.topCenter.x, TRIANGLE_UVS.topCenter.y);
    uvs.push(TRIANGLE_UVS.bottomRight.x, TRIANGLE_UVS.bottomRight.y);
    
    groups.push({ start: vertexIndex, count: 3, materialIndex: 3 });
    vertexIndex += 3;

    // Bottom cap (triangular face) - material index 4
    // CCW winding when viewed from below (negative Y)
    // Vertices should go counter-clockwise when looking up at the bottom
    const bottomNormal = new THREE.Vector3(0, -1, 0);
    positions.push(bottomVertices[0].x, bottomVertices[0].y, bottomVertices[0].z);
    positions.push(bottomVertices[1].x, bottomVertices[1].y, bottomVertices[1].z);
    positions.push(bottomVertices[2].x, bottomVertices[2].y, bottomVertices[2].z);
    
    for (let j = 0; j < 3; j++) {
      normals.push(bottomNormal.x, bottomNormal.y, bottomNormal.z);
    }
    
    // Triangular UV mapping for bottom cap
    uvs.push(TRIANGLE_UVS.bottomLeft.x, TRIANGLE_UVS.bottomLeft.y);
    uvs.push(TRIANGLE_UVS.bottomRight.x, TRIANGLE_UVS.bottomRight.y);
    uvs.push(TRIANGLE_UVS.topCenter.x, TRIANGLE_UVS.topCenter.y);
    
    groups.push({ start: vertexIndex, count: 3, materialIndex: 4 });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    
    for (const group of groups) {
      geometry.addGroup(group.start, group.count, group.materialIndex);
    }

    // Compute vertex normals for proper lighting
    geometry.computeVertexNormals();

    return geometry;
  }

  /**
   * Create D4 geometry (tetrahedron)
   * Has 4 triangular faces, each with its own material group
   */
  static createD4Geometry(): THREE.BufferGeometry {
    const size = 0.6;
    
    // Tetrahedron vertices (regular tetrahedron centered at origin)
    const a = size;
    const vertices = [
      new THREE.Vector3(a, a, a),      // 0
      new THREE.Vector3(a, -a, -a),    // 1
      new THREE.Vector3(-a, a, -a),    // 2
      new THREE.Vector3(-a, -a, a),    // 3
    ];

    // Face definitions (vertex indices, wound counter-clockwise when viewed from outside)
    const faces = [
      [0, 1, 2], // Face 0
      [0, 3, 1], // Face 1
      [0, 2, 3], // Face 2
      [1, 3, 2], // Face 3
    ];

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const groups: { start: number; count: number; materialIndex: number }[] = [];

    let vertexIndex = 0;

    for (let faceIdx = 0; faceIdx < faces.length; faceIdx++) {
      const face = faces[faceIdx];
      const v0 = vertices[face[0]];
      const v1 = vertices[face[1]];
      const v2 = vertices[face[2]];

      // Calculate face normal
      const edge1 = new THREE.Vector3().subVectors(v1, v0);
      const edge2 = new THREE.Vector3().subVectors(v2, v0);
      const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();

      // Add vertices
      positions.push(v0.x, v0.y, v0.z);
      positions.push(v1.x, v1.y, v1.z);
      positions.push(v2.x, v2.y, v2.z);

      // Add normals
      for (let j = 0; j < 3; j++) {
        normals.push(normal.x, normal.y, normal.z);
      }

      // Add triangular UVs (centered triangle)
      uvs.push(TRIANGLE_UVS.bottomLeft.x, TRIANGLE_UVS.bottomLeft.y);
      uvs.push(TRIANGLE_UVS.bottomRight.x, TRIANGLE_UVS.bottomRight.y);
      uvs.push(TRIANGLE_UVS.topCenter.x, TRIANGLE_UVS.topCenter.y);

      // Material group for this face
      groups.push({ start: vertexIndex, count: 3, materialIndex: faceIdx });
      vertexIndex += 3;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

    for (const group of groups) {
      geometry.addGroup(group.start, group.count, group.materialIndex);
    }

    // Compute vertex normals for proper lighting
    geometry.computeVertexNormals();

    return geometry;
  }

  /**
   * Create D6 geometry (cube)
   * Standard box geometry with 6 faces
   */
  static createD6Geometry(): THREE.BufferGeometry {
    const geometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
    // BoxGeometry already has proper groups for 6 faces
    return geometry;
  }

  /**
   * Create D8 geometry (octahedron)
   * Has 8 triangular faces, each with its own material group
   */
  static createD8Geometry(): THREE.BufferGeometry {
    const size = 0.6;

    // Octahedron vertices
    const vertices = [
      new THREE.Vector3(0, size, 0),   // 0: top
      new THREE.Vector3(0, -size, 0),  // 1: bottom
      new THREE.Vector3(size, 0, 0),   // 2: +x
      new THREE.Vector3(-size, 0, 0),  // 3: -x
      new THREE.Vector3(0, 0, size),   // 4: +z
      new THREE.Vector3(0, 0, -size),  // 5: -z
    ];

    // Face definitions (8 triangular faces)
    const faces = [
      [0, 4, 2], // Face 0: top-front-right
      [0, 2, 5], // Face 1: top-right-back
      [0, 5, 3], // Face 2: top-back-left
      [0, 3, 4], // Face 3: top-left-front
      [1, 2, 4], // Face 4: bottom-front-right
      [1, 5, 2], // Face 5: bottom-right-back
      [1, 3, 5], // Face 6: bottom-back-left
      [1, 4, 3], // Face 7: bottom-left-front
    ];

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const groups: { start: number; count: number; materialIndex: number }[] = [];

    let vertexIndex = 0;

    for (let faceIdx = 0; faceIdx < faces.length; faceIdx++) {
      const face = faces[faceIdx];
      const v0 = vertices[face[0]];
      const v1 = vertices[face[1]];
      const v2 = vertices[face[2]];

      // Calculate face normal
      const edge1 = new THREE.Vector3().subVectors(v1, v0);
      const edge2 = new THREE.Vector3().subVectors(v2, v0);
      const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();

      // Add vertices
      positions.push(v0.x, v0.y, v0.z);
      positions.push(v1.x, v1.y, v1.z);
      positions.push(v2.x, v2.y, v2.z);

      // Add normals
      for (let j = 0; j < 3; j++) {
        normals.push(normal.x, normal.y, normal.z);
      }

      // Add triangular UVs - alternate between normal and inverted for variety
      if (faceIdx < 4) {
        // Top faces - normal triangle
        uvs.push(TRIANGLE_UVS.bottomLeft.x, TRIANGLE_UVS.bottomLeft.y);
        uvs.push(TRIANGLE_UVS.bottomRight.x, TRIANGLE_UVS.bottomRight.y);
        uvs.push(TRIANGLE_UVS.topCenter.x, TRIANGLE_UVS.topCenter.y);
      } else {
        // Bottom faces - inverted triangle
        uvs.push(TRIANGLE_UVS_INVERTED.topLeft.x, TRIANGLE_UVS_INVERTED.topLeft.y);
        uvs.push(TRIANGLE_UVS_INVERTED.topRight.x, TRIANGLE_UVS_INVERTED.topRight.y);
        uvs.push(TRIANGLE_UVS_INVERTED.bottomCenter.x, TRIANGLE_UVS_INVERTED.bottomCenter.y);
      }

      // Material group for this face
      groups.push({ start: vertexIndex, count: 3, materialIndex: faceIdx });
      vertexIndex += 3;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

    for (const group of groups) {
      geometry.addGroup(group.start, group.count, group.materialIndex);
    }

    // Compute vertex normals for proper lighting
    geometry.computeVertexNormals();

    return geometry;
  }

  /**
   * Create D10 geometry (pentagonal trapezohedron)
   * Has 10 kite-shaped faces (each made of 2 triangles)
   */
  static createD10Geometry(): THREE.BufferGeometry {
    const radius = 0.5;
    const topHeight = 0.7;      // Apex height (affects overall die height)
    const bottomHeight = -0.7;  // Symmetric bottom apex
    
    // Create vertices for pentagonal trapezohedron (D10)
    // Top apex vertex
    const topApex = new THREE.Vector3(0, topHeight, 0);
    // Bottom apex vertex
    const bottomApex = new THREE.Vector3(0, bottomHeight, 0);
    
    // Middle ring has 10 vertices - 5 for top pentagon, 5 for bottom pentagon
    // The top and bottom pentagons are offset by 36 degrees (π/5 radians)
    const topRingVertices: THREE.Vector3[] = [];
    const bottomRingVertices: THREE.Vector3[] = [];
    
    // Ring height must be ~0.1056 * apex height for flat (coplanar) kite faces
    const topRingHeight = 0.0739;
    const bottomRingHeight = -0.0739;
    
    for (let i = 0; i < 5; i++) {
      // Top ring vertices (no offset)
      const topAngle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
      topRingVertices.push(new THREE.Vector3(
        radius * Math.cos(topAngle),
        topRingHeight,
        radius * Math.sin(topAngle)
      ));
      
      // Bottom ring vertices (offset by 36 degrees = π/5)
      const bottomAngle = topAngle + Math.PI / 5;
      bottomRingVertices.push(new THREE.Vector3(
        radius * Math.cos(bottomAngle),
        bottomRingHeight,
        radius * Math.sin(bottomAngle)
      ));
    }

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const groups: { start: number; count: number; materialIndex: number }[] = [];

    let vertexIndex = 0;

    // Helper function to add a kite face (4 vertices forming 2 triangles)
    // Kite shape: top vertex, left vertex, bottom vertex, right vertex
    // Split into 2 triangles along the top-bottom diagonal
    const addKiteFace = (top: THREE.Vector3, left: THREE.Vector3, bottom: THREE.Vector3, right: THREE.Vector3) => {
      // Calculate face center for normal direction check
      const faceCenter = new THREE.Vector3(
        (top.x + left.x + bottom.x + right.x) / 4,
        (top.y + left.y + bottom.y + right.y) / 4,
        (top.z + left.z + bottom.z + right.z) / 4
      );
      
      // Triangle 1: top -> left -> bottom (left half of kite)
      // Triangle 2: top -> bottom -> right (right half of kite)
      
      // Calculate normal for triangle 1
      const edge1a = new THREE.Vector3().subVectors(left, top);
      const edge2a = new THREE.Vector3().subVectors(bottom, top);
      const normal1 = new THREE.Vector3().crossVectors(edge1a, edge2a).normalize();
      
      // Check if normal points outward
      const shouldFlip = faceCenter.dot(normal1) < 0;
      
      if (shouldFlip) {
        normal1.negate();
      }
      
      // Add Triangle 1: top-left-bottom
      if (shouldFlip) {
        positions.push(top.x, top.y, top.z);
        positions.push(bottom.x, bottom.y, bottom.z);
        positions.push(left.x, left.y, left.z);
      } else {
        positions.push(top.x, top.y, top.z);
        positions.push(left.x, left.y, left.z);
        positions.push(bottom.x, bottom.y, bottom.z);
      }
      
      for (let j = 0; j < 3; j++) {
        normals.push(normal1.x, normal1.y, normal1.z);
      }
      
      // UV coordinates for left triangle of kite
      // Kite UV layout: top (0.5, 1), left (0, 0.5), bottom (0.5, 0), right (1, 0.5)
      if (shouldFlip) {
        uvs.push(0.5, 1.0);  // top
        uvs.push(0.5, 0.0);  // bottom
        uvs.push(0.0, 0.5);  // left
      } else {
        uvs.push(0.5, 1.0);  // top
        uvs.push(0.0, 0.5);  // left
        uvs.push(0.5, 0.0);  // bottom
      }
      
      // Add Triangle 2: top-bottom-right
      if (shouldFlip) {
        positions.push(top.x, top.y, top.z);
        positions.push(right.x, right.y, right.z);
        positions.push(bottom.x, bottom.y, bottom.z);
      } else {
        positions.push(top.x, top.y, top.z);
        positions.push(bottom.x, bottom.y, bottom.z);
        positions.push(right.x, right.y, right.z);
      }
      
      for (let j = 0; j < 3; j++) {
        normals.push(normal1.x, normal1.y, normal1.z);
      }
      
      // UV coordinates for right triangle of kite
      if (shouldFlip) {
        uvs.push(0.5, 1.0);  // top
        uvs.push(1.0, 0.5);  // right
        uvs.push(0.5, 0.0);  // bottom
      } else {
        uvs.push(0.5, 1.0);  // top
        uvs.push(0.5, 0.0);  // bottom
        uvs.push(1.0, 0.5);  // right
      }
    };

    // Create 10 kite-shaped faces
    // 5 faces connect top apex to top ring and bottom ring (upper kites)
    // 5 faces connect bottom apex to bottom ring and top ring (lower kites)
    
    for (let i = 0; i < 5; i++) {
      const nextI = (i + 1) % 5;
      
      // Upper kite face (face index = i * 2)
      // Vertices: topApex (top), topRing[i] (left), bottomRing[i] (bottom), topRing[nextI] (right)
      addKiteFace(topApex, topRingVertices[i], bottomRingVertices[i], topRingVertices[nextI]);
      groups.push({ start: vertexIndex, count: 6, materialIndex: i * 2 });
      vertexIndex += 6;
      
      // Lower kite face (face index = i * 2 + 1)
      // Vertices: topRing[nextI] (top), bottomRing[i] (left), bottomApex (bottom), bottomRing[nextI] (right)
      addKiteFace(topRingVertices[nextI], bottomRingVertices[i], bottomApex, bottomRingVertices[nextI]);
      groups.push({ start: vertexIndex, count: 6, materialIndex: i * 2 + 1 });
      vertexIndex += 6;
    }


    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

    for (const group of groups) {
      geometry.addGroup(group.start, group.count, group.materialIndex);
    }

    return geometry;
  }


  /**
   * Get the number of faces for each die type
   */
  static getFaceCount(type: DieType): number {
    switch (type) {
      case 'd3': return 5;  // 3 rectangular sides + 2 triangular caps
      case 'd4': return 4;
      case 'd6': return 6;
      case 'd8': return 8;
      case 'd10': return 10;
      default: return 6;
    }
  }

  /**
   * Check if a die type has triangular faces
   */
  static hasTriangularFaces(type: DieType): boolean {
    return type === 'd3' || type === 'd4' || type === 'd8' || type === 'd10';
  }
}

/**
 * Create a texture for a die face with proper positioning for triangular UVs
 * @param value The number to display
 * @param bgColor Background color
 * @param isTriangular Whether the face is triangular (affects text positioning)
 * @param isInverted Whether the triangle is inverted (for bottom faces of d8, d10)
 * @param isDiamond Whether the face uses diamond UV mapping (for D10 kite faces)
 */
export function createDiceTexture(
  value: number,
  bgColor: number,
  isTriangular: boolean = false,
  isInverted: boolean = false,
  isDiamond: boolean = false
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');

  // Fill background with dice color
  ctx.fillStyle = '#' + bgColor.toString(16).padStart(6, '0');
  ctx.fillRect(0, 0, 256, 256);

  if (isDiamond) {
    // For D10 diamond/kite faces
    // The diamond UV coordinates are:
    // Top: (0.5, 1), Bottom: (0.5, 0), Left: (0, 0.5), Right: (1, 0.5)
    // Center of diamond is at (0.5, 0.5) -> canvas (128, 128)
    
    const centerX = 128;
    const centerY = 128;
    
    // Draw number scaled to fit inside the diamond
    // The diamond inscribed circle has radius ~90 pixels (half of 180, accounting for margins)
    const fontSize = 80;
    
    ctx.save();
    ctx.translate(centerX, centerY);
    
    // No rotation needed - just center the text in the diamond
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Draw outline
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 6;
    ctx.strokeText(value.toString(), 0, 0);

    // Draw fill
    ctx.fillStyle = 'white';
    ctx.fillText(value.toString(), 0, 0);
    
    ctx.restore();

    // Optional: Draw diamond outline for debugging
    // ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
    // ctx.lineWidth = 2;
    // ctx.beginPath();
    // ctx.moveTo(128, 0);    // Top (0.5, 1) -> canvas y is inverted
    // ctx.lineTo(256, 128);  // Right (1, 0.5)
    // ctx.lineTo(128, 256);  // Bottom (0.5, 0)
    // ctx.lineTo(0, 128);    // Left (0, 0.5)
    // ctx.closePath();
    // ctx.stroke();
  } else if (isTriangular) {
    // For triangular faces, draw the number in the centroid of the triangle
    // The triangle UVs are:
    // Normal: bottomLeft (0.1, 0.1), bottomRight (0.9, 0.1), topCenter (0.5, 0.9)
    // Inverted: topLeft (0.1, 0.9), topRight (0.9, 0.9), bottomCenter (0.5, 0.1)
    
    // Calculate centroid position in canvas coordinates
    let centroidX: number;
    let centroidY: number;
    
    if (isInverted) {
      // Inverted triangle centroid
      centroidX = (0.1 + 0.9 + 0.5) / 3 * 256; // ~128
      centroidY = (1 - (0.9 + 0.9 + 0.1) / 3) * 256; // ~108 (from top)
    } else {
      // Normal triangle centroid
      centroidX = (0.1 + 0.9 + 0.5) / 3 * 256; // ~128
      centroidY = (1 - (0.1 + 0.1 + 0.9) / 3) * 256; // ~162 (from top)
    }

    // Draw number at centroid
    const fontSize = 72;
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Draw outline
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 6;
    ctx.strokeText(value.toString(), centroidX, centroidY);

    // Draw fill
    ctx.fillStyle = 'white';
    ctx.fillText(value.toString(), centroidX, centroidY);

    // Optional: Draw triangle outline for debugging
    // ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
    // ctx.lineWidth = 2;
    // ctx.beginPath();
    // if (isInverted) {
    //   ctx.moveTo(0.1 * 256, (1 - 0.9) * 256);
    //   ctx.lineTo(0.9 * 256, (1 - 0.9) * 256);
    //   ctx.lineTo(0.5 * 256, (1 - 0.1) * 256);
    // } else {
    //   ctx.moveTo(0.1 * 256, (1 - 0.1) * 256);
    //   ctx.lineTo(0.9 * 256, (1 - 0.1) * 256);
    //   ctx.lineTo(0.5 * 256, (1 - 0.9) * 256);
    // }
    // ctx.closePath();
    // ctx.stroke();
  } else {
    // For square faces, center the number
    const fontSize = 120;
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Draw outline
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 6;
    ctx.strokeText(value.toString(), 128, 128);

    // Draw fill
    ctx.fillStyle = 'white';
    ctx.fillText(value.toString(), 128, 128);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Create materials array for a die with proper textures for each face
 * @param type Die type
 * @param faceValue The value to display on all faces
 * @param bgColor Background color
 */
export function createDiceMaterials(
  type: DieType,
  faceValue: number,
  bgColor: number
): THREE.MeshStandardMaterial[] {
  const faceCount = DiceGeometryFactory.getFaceCount(type);
  const materials: THREE.MeshStandardMaterial[] = [];
  const isTriangular = DiceGeometryFactory.hasTriangularFaces(type);

  for (let i = 0; i < faceCount; i++) {
    // Determine if this face uses inverted triangle UVs
    let isInverted = false;
    if (type === 'd8' && i >= 4) {
      isInverted = true;
    } else if (type === 'd10' && i % 2 === 1) {
      isInverted = true;
    }

    // For D3, faces 0-2 are rectangular, faces 3-4 are triangular
    const faceIsTriangular = type === 'd3' ? (i >= 3) : isTriangular;
    
    // D10 uses diamond UV mapping for its kite-shaped faces
    const isDiamond = type === 'd10';

    const texture = createDiceTexture(faceValue, bgColor, faceIsTriangular, isInverted, isDiamond);
    
    materials.push(new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.3,
      metalness: 0.1,
    }));
  }

  return materials;
}


export default DiceGeometryFactory;
