import * as THREE from "three";
import { BILLBOARD_WIDTH, BILLBOARD_HEIGHT, BILLBOARD_DEPTH, BILLBOARD_POLE_HEIGHT } from "./constants";

export interface BillboardOptions {
  position: THREE.Vector3;
  /** Optional texture URL for the ad image */
  textureUrl?: string;
  /** District color for the frame glow */
  frameColor?: number;
  onClick?: (billboardId: string) => void;
}

export class Billboard {
  readonly id: string;
  readonly mesh: THREE.Group;

  private _clicks = 0;

  constructor(id: string, options: BillboardOptions) {
    this.id = id;
    this.mesh = this.build(options);
  }

  private build(options: BillboardOptions): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(options.position);
    group.userData = { type: "billboard", id: this.id };

    // Pole
    const poleGeo = new THREE.CylinderGeometry(0.15, 0.15, BILLBOARD_POLE_HEIGHT, 8);
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0x333340,
      roughness: 0.7,
      metalness: 0.8,
    });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = BILLBOARD_POLE_HEIGHT / 2;
    group.add(pole);

    // Panel
    const panelGeo = new THREE.BoxGeometry(BILLBOARD_WIDTH, BILLBOARD_HEIGHT, BILLBOARD_DEPTH);
    const panelMat = new THREE.MeshStandardMaterial({
      color: options.textureUrl ? 0xffffff : 0x1a1a2e,
      emissive: options.frameColor ?? 0xd4af37,
      emissiveIntensity: 0.15,
      roughness: 0.4,
    });

    if (options.textureUrl) {
      const loader = new THREE.TextureLoader();
      loader.load(options.textureUrl, (texture) => {
        (panelMat as THREE.MeshStandardMaterial).map = texture;
        panelMat.needsUpdate = true;
      });
    }

    const panel = new THREE.Mesh(panelGeo, panelMat);
    panel.position.y = BILLBOARD_POLE_HEIGHT + BILLBOARD_HEIGHT / 2;
    group.add(panel);

    // Neon frame edges
    const frameGeo = new THREE.EdgesGeometry(
      new THREE.BoxGeometry(
        BILLBOARD_WIDTH + 0.2,
        BILLBOARD_HEIGHT + 0.2,
        BILLBOARD_DEPTH + 0.05
      )
    );
    const frameMat = new THREE.LineBasicMaterial({
      color: options.frameColor ?? 0xd4af37,
    });
    const frame = new THREE.LineSegments(frameGeo, frameMat);
    frame.position.y = BILLBOARD_POLE_HEIGHT + BILLBOARD_HEIGHT / 2;
    group.add(frame);

    return group;
  }

  recordClick(): void {
    this._clicks += 1;
  }

  get clicks(): number {
    return this._clicks;
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
