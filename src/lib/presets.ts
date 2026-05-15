const USER_PRESETS_KEY = 'polyhydra-user-presets';

export interface AppPreset {
  name: string;
  params: string;
}

export const EXAMPLE_PRESETS: AppPreset[] = [
  { name: 'Companion Cubie', params: 'mode=3d&finalization=planarize&radialType=TruncatedCuboctahedron&radialSides=6&tiling=multigrid&rows=5&cols=5&edges=true&vertices=false&faces=true&wireframe=false&palette=vibrant&colorMode=value&edgeColor=%233b82f6&mgDim=9&mgDiv=9&mgOff=-1.43&mgRand=false&mgShared=true&mgMin=0&mgMax=0.35&mgRatio=1&mgIntersect=0&mgIndex=0&mgSeed=1&ops=V-ve%252Cfe-fe%21%252Cfe-ve%7E0.5%7E0.86%7E0.58' },
  { name: 'Isfahan', params: 'mode=2d&finalization=planarize&radialType=ElongatedCupola&radialSides=5&tiling=demiregular-hexagonal&rows=5&cols=5&edges=false&vertices=false&faces=true&wireframe=false&palette=desert&colorMode=sides&edgeColor=%233b82f6&mgDim=5&mgDiv=5&mgOff=0.2&mgRand=false&mgShared=true&mgMin=0&mgMax=0.35&mgRatio=1&mgIntersect=0&mgIndex=0&mgSeed=1&ops=E-fe%252CE-ve%252Cfe-fe%252Cfe-ve%7E0.5%7E0.5%7E0.5' },
  { name: 'Pointy Grid', params: 'mode=2d&finalization=planarize&radialType=Prism&radialSides=5&tiling=4.4.4.4&rows=5&cols=5&edges=true&vertices=false&faces=true&wireframe=false&palette=vibrant&colorMode=role&edgeColor=%233b82f6&mgDim=5&mgDiv=5&mgOff=0.2&mgRand=false&mgShared=true&mgMin=0&mgMax=0.35&mgRatio=1&mgIntersect=0&mgIndex=0&mgSeed=1&ops=F-fe%252Cfe-fe%21%252Cfe-ve%7E0.47%7E0.34%7E0.73'},
  { name: 'Maltese Floor', params: 'mode=2d&finalization=planarize&radialType=Prism&radialSides=5&tiling=4.4.4.4&rows=5&cols=5&edges=true&vertices=false&faces=true&wireframe=false&palette=vibrant&colorMode=role&edgeColor=%233b82f6&mgDim=5&mgDiv=5&mgOff=0.2&mgRand=false&mgShared=true&mgMin=0&mgMax=0.35&mgRatio=1&mgIntersect=0&mgIndex=0&mgSeed=1&ops=V-ve%252Cfe-V%252Cfe-fe%21%252Cfe-ve%7E0.5%7E0.5%7E0.5'},
];

export function getUserPresets(): AppPreset[] {
  try {
    const stored = localStorage.getItem(USER_PRESETS_KEY);
    return stored ? (JSON.parse(stored) as AppPreset[]) : [];
  } catch {
    return [];
  }
}

export function saveUserPreset(preset: AppPreset): void {
  const presets = getUserPresets();
  presets.push(preset);
  localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(presets));
}

export function deleteUserPreset(index: number): void {
  const presets = getUserPresets();
  presets.splice(index, 1);
  localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(presets));
}
