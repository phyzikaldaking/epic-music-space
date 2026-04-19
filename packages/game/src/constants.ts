/** EMS district identifiers */
export type DistrictName =
  | "DOWNTOWN_PRIME"
  | "PRODUCER_ALLEY"
  | "UNDERGROUND"
  | "VIP_TOWERS";

export interface DistrictConfig {
  name: DistrictName;
  label: string;
  /** Three.js hex color for the district zone floor */
  color: number;
  /** Emissive neon glow color */
  emissive: number;
  /** World-space center position [x, z] */
  position: [number, number];
  /** Zone size [width, depth] */
  size: [number, number];
  /** Billboard slot count */
  billboardSlots: number;
}

export const DISTRICT_CONFIGS: Record<DistrictName, DistrictConfig> = {
  DOWNTOWN_PRIME: {
    name: "DOWNTOWN_PRIME",
    label: "Downtown Prime",
    color: 0x1a1500,
    emissive: 0xd4af37,
    position: [0, 0],
    size: [60, 60],
    billboardSlots: 4,
  },
  VIP_TOWERS: {
    name: "VIP_TOWERS",
    label: "VIP Towers",
    color: 0x0d0a1a,
    emissive: 0x7b3fe4,
    position: [80, 0],
    size: [40, 40],
    billboardSlots: 2,
  },
  PRODUCER_ALLEY: {
    name: "PRODUCER_ALLEY",
    label: "Producer Alley",
    color: 0x050a1a,
    emissive: 0x1e40af,
    position: [-80, 0],
    size: [50, 50],
    billboardSlots: 6,
  },
  UNDERGROUND: {
    name: "UNDERGROUND",
    label: "Underground",
    color: 0x0a0a0f,
    emissive: 0x333333,
    position: [0, 100],
    size: [80, 80],
    billboardSlots: 8,
  },
};

/** Building dimensions */
export const STUDIO_HEIGHT_RANGE: [number, number] = [8, 30];
export const STUDIO_WIDTH = 6;
export const STUDIO_DEPTH = 6;

/** Billboard dimensions */
export const BILLBOARD_WIDTH = 8;
export const BILLBOARD_HEIGHT = 4;
export const BILLBOARD_DEPTH = 0.2;
export const BILLBOARD_POLE_HEIGHT = 5;

/** Camera defaults */
export const CAMERA_FOV = 60;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 2000;
export const CAMERA_INITIAL_POSITION: [number, number, number] = [0, 80, 120];
export const CAMERA_INITIAL_TARGET: [number, number, number] = [0, 0, 0];
