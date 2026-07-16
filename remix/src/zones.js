// Altitude zones — pure data consumed by the sim (rules), the background
// renderer (skies), and the music system (intensity floor). camY only ever
// rises, so transitions fire once each, in order.
//
// Each zone adds exactly ONE new sim behavior: stormfront unlocks wind,
// cloudtop adds crumble-cloud platforms, aurora adds drift blocks, the void
// tightens the event cadence.

export const ZONES = [
  {
    id: 'meadow',
    name: 'MEADOW',
    threshold: 0,
    bonus: 0,
    skyTop: 0x6ec0f2,
    skyBottom: 0xd8f0ff,
    blockTint: 0xffffff, // white = untinted
    musicIntensity: 0,
    cloudAlpha: 0.75,
    rain: false,
    stars: false,
    aurora: false,
    cloudPlatforms: false,
    driftChance: 0,
  },
  {
    id: 'stormfront',
    name: 'STORMFRONT',
    threshold: 250,
    bonus: 250,
    skyTop: 0x2f3d55,
    skyBottom: 0x71809b,
    blockTint: 0xc7d2e4,
    musicIntensity: 1,
    cloudAlpha: 0.35,
    rain: true,
    stars: false,
    aurora: false,
    cloudPlatforms: false,
    driftChance: 0,
  },
  {
    id: 'cloudtop',
    name: 'CLOUDTOP',
    threshold: 1200,
    bonus: 500,
    skyTop: 0xbfe9ff,
    skyBottom: 0xfff3d6,
    blockTint: 0xffedc9,
    musicIntensity: 2,
    cloudAlpha: 0.95,
    rain: false,
    stars: false,
    aurora: false,
    cloudPlatforms: true,
    driftChance: 0,
  },
  {
    id: 'aurora',
    name: 'AURORA',
    threshold: 4000,
    bonus: 750,
    skyTop: 0x241b47,
    skyBottom: 0xa8659e,
    blockTint: 0xd9c4f2,
    musicIntensity: 3,
    cloudAlpha: 0.15,
    rain: false,
    stars: true,
    aurora: true,
    cloudPlatforms: false,
    driftChance: 0.25,
  },
  {
    id: 'void',
    name: 'THE VOID',
    threshold: 10000,
    bonus: 1000,
    skyTop: 0x04060e,
    skyBottom: 0x161f36,
    blockTint: 0x9fb4d8,
    musicIntensity: 4,
    cloudAlpha: 0,
    rain: false,
    stars: true,
    aurora: false,
    cloudPlatforms: false,
    driftChance: 0.25,
  },
];

export function zoneIndexFor(camY) {
  for (let i = ZONES.length - 1; i >= 0; i--) {
    if (camY >= ZONES[i].threshold) return i;
  }
  return 0;
}
