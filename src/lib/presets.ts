const USER_PRESETS_KEY = 'polyhydra-user-presets';

export interface AppPreset {
  name: string;
  params: string;
}

function normalizePresetParams(paramsString: string) {
  const params = new URLSearchParams(paramsString);
  params.delete('e');
  params.delete('edges');
  return params.toString();
}

function normalizePreset(preset: AppPreset): AppPreset {
  return {
    ...preset,
    params: normalizePresetParams(preset.params),
  };
}

export const EXAMPLE_PRESETS: AppPreset[] = [
  { name: 'Companion Cubie', params: 'm=3&rt=a&rs=6&t=15&cm=v&gd=9&gv=9&go=-1.43&o=4av4.1e2e1m' },
  { name: 'Meteor Shrine', params: 'm=3&rt=g&p=alhambra&cm=r&o=1reo' },
  { name: 'Isfahan', params: 'rt=15&t=p&s=4&p=desert&cm=s&rf=0.6666666666666667&o=3ifs' },
  { name: 'Pointy Grid', params: 'o=47wg.1b0y21'},
  { name: 'Maltese Floor', params: 'p=girih&po=52716034&rf=0.6666666666666667&o=4ni8'},
  { name: 'Frutti', params: 't=15&po=23560714&cm=s&rf=0.6666666666666667&o=4zthc.1q1p24'},
  { name: 'Wakha', params: 't=y&p=alhambra&rf=0.6666666666666667&o=kd8g.1e0j0w'},
  { name: 'Ewe', params: 'm=3&rt=3&t=p&r=4&po=32457016&cm=s&ew=0.01&ed=0.015&es=0.6&a=0.85&rf=0&fo=1&o=1brbc.1o131e%3B2hwdc.1f1n1e'},
  { name: 'Cake', params: 'm=3&rs=12&t=p&s=4&po=32457016&cm=s&ew=0.01&ed=0.015&es=0.6&a=0.85&rf=0&o=2i48w%3B1cglc'},
  { name: 'Hex Trap Stack', params: 'm=3&fn=n&rt=x&rs=6&t=5&s=2&rf=0.6666666666666667&o=1y8lc%3Bca.p1.6.0k.2.2.08.08.1e.1e.0p.1e.1e.0p.0p.1.xy.1.08.generic.3.1l.1e.1i.1e.1e.1e.0x%3Bca.p1.6.0k.2.2.08.08.1e.1e.0p.1e.1e.0p.0p.1.xy.1.08.generic.3.1f.1e.16.1e.1e.1e.0x' },
  { name: 'Crystal Web', params: 'm=3&rf=0.6666666666666667&o=cp.Cn.a.0g.1.2.08.08.1e.1e.0p.1e.1e.0p.0p.1.xz.1.01.edge.3.1c.1e.1e.1e.1e.1e.0m%3B1d91c%3Bds.0py' },
  { name: 'Ember Tetra', params: 'm=3&rt=0&t=t&r=4&c=6&p=midnight&ew=0.01&ed=0.015&es=0.6&a=0.85&rf=0&gd=10&gv=4&go=-0.59&o=18ykg.1a0n16' },
  { name: 'Bauhaus Block', params: 'm=3&rt=1&t=p&s=4&p=bauhaus&po=12304567&ew=0.01&ed=0.015&es=0.6&a=0.85&rf=0&o=6o74.141n15%3B6cg' },
  { name: 'Iznik Spinner', params: 'm=3&rt=1e&rs=6&bx=5&by=5&bz=5&ch=6&s=2&p=isthmus&po=57342106&rc=6&rd=4&rb=sides&rf=0.6666666666666667&gv=2&go=1.09&gn=0.06&gx=0.43&o=48em8.0c1r0y%3Bdp.2ry' },
  { name: 'Whirling Gourd', params: 'm=3&rt=1g&rf=0.6666666666666667&o=cng%3Bdp.2ry' },
  { name: 'Mint Drum', params: 'm=3&rt=1h&rs=6&t=p&s=4&p=desert&po=67123504&cm=s&ew=0.01&ed=0.015&es=0.6&a=0.85&rf=0&o=6qayo' },
  { name: 'Octabla', params: 'm=3&rt=1m&rs=8&rb=sides&rf=0.6666666666666667&o=6rpj4.0v1t1g%3Bdz.1ny%3Bds.16.1z.0p.y' },
  { name: 'Wicker Globe', params: 'm=3&rt=1p&bx=4&by=4&bz=4&t=9&rf=0.6666666666666667&o=1cglc%7Cn%3Bdp.2ry%3Bdk' },
  { name: 'Parcelball', params: 'm=3&rt=1p&bx=4&by=4&bz=4&t=9&rf=0.6666666666666667&o=4zthc.1g1e1e%7Cc' },
  { name: 'Caustiblob', params: 'm=3&rt=1p&bx=5&by=5&bz=5&s=2&po=27051634&rc=5&rd=2&rf=0.6666666666666667&gv=2&go=1.09&gn=0.06&gx=0.43&o=48em8.0e0q0p%3Bdp.2ry' },
  { name: 'Rhodes Chest', params: 'm=3&rt=1p&rs=6&bx=3&by=3&bz=3&s=4&rb=sides&rf=0.6666666666666667&gd=9&gv=9&go=-1.43&o=ao0.1e2e1m%7Cn%3B1vf9c.201e1e%7Cn%3Bdz.00y' },
  { name: 'Octo Ring', params: 'm=3&rt=1r&rs=8&tp=4&rf=0.6666666666666667&o=e8' },
  { name: 'Insectoid', params: 'm=3&rt=GreatDodecahedron&rd=5&rb=sides&rf=0.6666666666666667&o=gy6w%7Cc' },
  { name: 'Hollow Follow', params: 'm=3&rt=GreatStellatedDodecahedron&t=9&rf=0.6666666666666667&o=1k7i8' },
  { name: 'Ring of Rings', params: 'm=3&rt=w&rs=4&p=girih&po=61325074&rc=5&rd=2&rb=angles&rf=0.6666666666666667&o=2czcw.0y161e%3Bcp.Cn.8.0g.1.2.08.08.1e.1e.0p.1e.1e.0p.0p.1.xz.1.00.face.3.1c.1e.1e.1e.1e.1e.0m%3Bcp.Cn.6.0k.2.1.08.08.1e.1e.0p.1g.1e.0p.0p.1.xy.1.00.face.3.1l.1e.1e.1e.1e.1e.0x' },
  { name: 'Candy Quilt', params: 'mode=2d&finalization=planarize&radialType=RhombicDodecahedron&radialSides=5&tiling=trihex-square&rows=5&cols=5&vertices=false&faces=true&wireframe=false&palette=vibrant&colorMode=role&edgeColor=%233b82f6&mgDim=5&mgDiv=5&mgOff=0.2&mgRand=false&mgShared=true&mgMin=0&mgMax=0.35&mgRatio=1&mgIntersect=0&mgIndex=0&mgSeed=1&ops=F-vf%252Cfe-fe%21%252Cfe-vf%7E0.38%7E0.78%7E0.48' },
  { name: 'Tetraforce', params: 'mode=3d&finalization=planarize&radialType=Tetrahedron&radialSides=6&tiling=multigrid&rows=5&cols=5&vertices=false&faces=true&wireframe=false&palette=vibrant&colorMode=value&edgeColor=%233b82f6&mgDim=9&mgDiv=9&mgOff=-1.43&mgRand=false&mgShared=true&mgMin=0&mgMax=0.35&mgRatio=1&mgIntersect=0&mgIndex=0&mgSeed=1&ops=V-ve%252Cfe-fe%21%252Cfe-ve%7E0.5%7E0.86%7E0.23' },
  { name: 'Vyshyvanka', params: 'p=isthmus&po=43627051&rf=0.6666666666666667&o=3flz4%3B1cglc' },
  { name: 'Dancing Tiles', params: 'rt=1c&s=4&p=bauhaus&po=07154632&rc=3&ew=0.01&ed=0.015&es=0.6&a=0.85&rf=0&o=1dvcw.141n15%3B6cg' },
  { name: 'Terracotta Rings', params: 'rt=1c&s=4&p=desert&rc=3&ew=0.01&ed=0.015&es=0.6&a=0.85&rf=0&o=19nh5.151n15%3B6cg' },
  { name: 'Snub Stars', params: 'rt=1c&t=a&s=3&p=desert&po=07436125&rc=3&rd=0&ew=0.01&ed=0.015&es=0.6&a=0.85&rf=0&o=19nh5.151n15%3B6cg' },
  { name: 'Hexagram', params: 'rt=3&rs=12&ch=6&ct=0&t=2&rd=5&rb=sides&rf=0.6666666666666667&gd=14&gv=6&go=0.88&o=5pnc.0d1421%3B1s' },
  { name: 'Zellige Rose', params: 'rt=3&t=15&s=4&p=zellige&po=05463127&cm=s&ew=0.01&ed=0.015&es=0.6&a=0.85&rf=0&gd=7&gv=4&go=-1.3&o=1d5vk.1o131e%3B2hwdc.1f1n1e' },
  { name: 'Girih Shards', params: 'rt=3&t=p&s=4&po=32457016&cm=s&ew=0.01&ed=0.015&es=0.6&a=0.85&rf=0&o=1brbc.1o131e%3B2hwdc.1f1n1e' },
  { name: 'Saucergrid', params: 'rt=4&t=r&rf=0.6666666666666667&o=2tc0.1b0y21' },
  { name: 'Clay Pinwheel', params: 'rt=9&t=a&r=4&c=6&p=desert&ew=0.01&ed=0.015&es=0.6&a=0.85&rf=0&gd=10&gv=4&go=-0.59&o=3fvgg.1a201g' },
  { name: 'Deep Hex', params: 'rt=9&t=t&r=4&c=6&p=midnight&ew=0.01&ed=0.015&es=0.6&a=0.85&rf=0&gd=10&gv=4&go=-0.59&o=18ykg.1a0n16' },
  { name: 'Wine Dark Sea', params: 'rt=9&t=t&s=4&p=desert&ew=0.01&ed=0.015&es=0.6&a=0.85&rf=0&o=2i2o0.141n15%3B6cg' },
  { name: 'Mamluk', params: 'rt=w&t=s&r=4&c=6&p=isthmus&ew=0.01&ed=0.015&es=0.6&a=0.85&rf=0&gd=10&gv=4&go=-0.59&o=1upz4.0w1i14' },
];

export function getUserPresets(): AppPreset[] {
  try {
    const stored = localStorage.getItem(USER_PRESETS_KEY);
    if (!stored) {
      return [];
    }

    const presets = (JSON.parse(stored) as AppPreset[]).map(normalizePreset);
    const normalized = JSON.stringify(presets);
    if (normalized !== stored) {
      localStorage.setItem(USER_PRESETS_KEY, normalized);
    }
    return presets;
  } catch {
    return [];
  }
}

export function saveUserPreset(preset: AppPreset): void {
  const presets = getUserPresets();
  presets.push(normalizePreset(preset));
  localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(presets));
}

export function deleteUserPreset(index: number): void {
  const presets = getUserPresets();
  presets.splice(index, 1);
  localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(presets));
}
