import * as THREE from "three";
import {
  DISTRICT_CONFIGS,
  CAMERA_FOV,
  CAMERA_NEAR,
  CAMERA_FAR,
  CAMERA_INITIAL_POSITION,
  CAMERA_INITIAL_TARGET,
} from "./constants";
import type { DistrictName } from "./constants";
import { Billboard } from "./Billboard";
import { Studio } from "./Studio";

export interface CitySceneOptions {
  canvas: HTMLCanvasElement;
  onStudioClick?: (studioId: string) => void;
  onBillboardClick?: (billboardId: string) => void;
}

export class CityScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private raycaster: THREE.Raycaster;
  private pointer: THREE.Vector2;
  private animationFrameId: number | null = null;

  readonly studios: Map<string, Studio> = new Map();
  readonly billboards: Map<string, Billboard> = new Map();

  private options: CitySceneOptions;

  constructor(options: CitySceneOptions) {
    this.options = options;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: options.canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(options.canvas.clientWidth, options.canvas.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.8;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0f);
    this.scene.fog = new THREE.FogExp2(0x0a0a0f, 0.005);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      CAMERA_FOV,
      options.canvas.clientWidth / options.canvas.clientHeight,
      CAMERA_NEAR,
      CAMERA_FAR
    );
    this.camera.position.set(...CAMERA_INITIAL_POSITION);
    this.camera.lookAt(...CAMERA_INITIAL_TARGET);

    // Raycaster for clicks
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.buildScene();
    this.attachListeners();
  }

  private buildScene(): void {
    // Ground plane
    const groundGeo = new THREE.PlaneGeometry(1000, 1000, 50, 50);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a0f,
      roughness: 1,
      metalness: 0,
      wireframe: false,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Grid helper overlay
    const grid = new THREE.GridHelper(500, 100, 0x1a1a2a, 0x111118);
    this.scene.add(grid);

    // Ambient light
    const ambient = new THREE.AmbientLight(0x111122, 0.5);
    this.scene.add(ambient);

    // Directional key light
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    this.scene.add(dirLight);

    // Build district zones
    for (const config of Object.values(DISTRICT_CONFIGS)) {
      this.buildDistrict(config.name);
    }
  }

  private buildDistrict(districtName: DistrictName): void {
    const config = DISTRICT_CONFIGS[districtName];

    // Zone floor
    const zoneGeo = new THREE.PlaneGeometry(...config.size);
    const zoneMat = new THREE.MeshStandardMaterial({
      color: config.color,
      emissive: config.emissive,
      emissiveIntensity: 0.08,
      roughness: 0.9,
    });
    const zone = new THREE.Mesh(zoneGeo, zoneMat);
    zone.rotation.x = -Math.PI / 2;
    zone.position.set(config.position[0], 0.01, config.position[1]);
    zone.receiveShadow = true;
    this.scene.add(zone);

    // Zone border glow
    const borderGeo = new THREE.EdgesGeometry(
      new THREE.BoxGeometry(config.size[0], 0.1, config.size[1])
    );
    const borderMat = new THREE.LineBasicMaterial({ color: config.emissive });
    const border = new THREE.LineSegments(borderGeo, borderMat);
    border.position.set(config.position[0], 0.05, config.position[1]);
    this.scene.add(border);

    // Point light for district ambience
    const districtLight = new THREE.PointLight(config.emissive, 2, config.size[0] * 1.5);
    districtLight.position.set(config.position[0], 20, config.position[1]);
    this.scene.add(districtLight);
  }

  addStudio(studioId: string, options: Omit<ConstructorParameters<typeof Studio>[1], never>): Studio {
    const studio = new Studio(studioId, options);
    this.studios.set(studioId, studio);
    this.scene.add(studio.mesh);
    return studio;
  }

  addBillboard(billboardId: string, options: ConstructorParameters<typeof Billboard>[1]): Billboard {
    const billboard = new Billboard(billboardId, options);
    this.billboards.set(billboardId, billboard);
    this.scene.add(billboard.mesh);
    return billboard;
  }

  private attachListeners(): void {
    const canvas = this.options.canvas;
    canvas.addEventListener("click", this.onCanvasClick);
    window.addEventListener("resize", this.onResize);
  }

  private onCanvasClick = (e: MouseEvent): void => {
    const rect = this.options.canvas.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const objects: THREE.Object3D[] = [];
    this.studios.forEach((s) => objects.push(s.mesh));
    this.billboards.forEach((b) => objects.push(b.mesh));

    const intersects = this.raycaster.intersectObjects(objects, true);
    if (intersects.length > 0) {
      let obj: THREE.Object3D | null = intersects[0].object;
      while (obj) {
        const { type, id } = obj.userData as { type?: string; id?: string };
        if (type === "studio" && id) {
          this.options.onStudioClick?.(id);
          return;
        }
        if (type === "billboard" && id) {
          const bb = this.billboards.get(id);
          bb?.recordClick();
          this.options.onBillboardClick?.(id);
          return;
        }
        obj = obj.parent;
      }
    }
  };

  private onResize = (): void => {
    const canvas = this.options.canvas;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  start(): void {
    const animate = () => {
      this.animationFrameId = requestAnimationFrame(animate);
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  dispose(): void {
    this.stop();
    this.options.canvas.removeEventListener("click", this.onCanvasClick);
    window.removeEventListener("resize", this.onResize);
    this.studios.forEach((s) => s.dispose());
    this.billboards.forEach((b) => b.dispose());
    this.renderer.dispose();
  }
}
