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
