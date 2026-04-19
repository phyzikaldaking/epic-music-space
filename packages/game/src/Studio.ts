import * as THREE from "three";
import {
  STUDIO_HEIGHT_RANGE,
  STUDIO_WIDTH,
  STUDIO_DEPTH,
} from "./constants";

export interface StudioOptions {
  position: THREE.Vector3;
  /** Artist's display name — shown as a floating label above the building */
  artistName: string;
  /** District accent color (hex) */
  accentColor?: number;
  onClick?: (studioId: string) => void;
}

export class Studio {
  readonly id: string;
  readonly mesh: THREE.Group;
  private _visits = 0;

  constructor(id: string, options: StudioOptions) {
    this.id = id;
    this.mesh = this.build(options);
  }

  private build(options: StudioOptions): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(options.position);
    group.userData = { type: "studio", id: this.id, artistName: options.artistName };

    // Randomize height for visual variety
    const height =
      STUDIO_HEIGHT_RANGE[0] +
      Math.random() * (STUDIO_HEIGHT_RANGE[1] - STUDIO_HEIGHT_RANGE[0]);

    // Main building body
    const bodyGeo = new THREE.BoxGeometry(STUDIO_WIDTH, height, STUDIO_DEPTH);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x0d0d14,
      roughness: 0.8,
      metalness: 0.3,
      emissive: options.accentColor ?? 0xd4af37,
      emissiveIntensity: 0.05,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = height / 2;
    group.add(body);

    // Rooftop glow strip
    const roofGeo = new THREE.BoxGeometry(STUDIO_WIDTH + 0.2, 0.3, STUDIO_DEPTH + 0.2);
    const roofMat = new THREE.MeshStandardMaterial({
      color: options.accentColor ?? 0xd4af37,
      emissive: options.accentColor ?? 0xd4af37,
      emissiveIntensity: 0.8,
    });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = height + 0.15;
    group.add(roof);

    // Window lights (simple emissive planes)
    const windowsPerFloor = 2;
    const floors = Math.max(1, Math.floor(height / 4));
    const windowMat = new THREE.MeshStandardMaterial({
      color: 0xffffcc,
      emissive: 0xffffaa,
      emissiveIntensity: Math.random() > 0.4 ? 0.6 : 0,
    });

    for (let floor = 0; floor < floors; floor++) {
      for (let w = 0; w < windowsPerFloor; w++) {
        const winGeo = new THREE.PlaneGeometry(0.8, 1.2);
        const win = new THREE.Mesh(winGeo, windowMat.clone());
        win.position.set(
          w === 0 ? -1 : 1,
          2 + floor * 4,
          STUDIO_DEPTH / 2 + 0.01
        );
        group.add(win);
      }
    }

    return group;
  }

  recordVisit(): void {
    this._visits += 1;
  }

  get visits(): number {
    return this._visits;
  }

  dispose(): void {
    this.mesh.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  }
}
