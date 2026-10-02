/* ==========================================================================
   BRONDERBILITY MUSIC — catalog & site config
   Everything editable lives here: contacts, socials, licenses, beats, kits.

   Each beat is synthesized live in the browser by assets/js/audio.js, so the
   site works with zero audio files. To use your real beats, drop an mp3/wav
   into assets/audio/ and set `src: 'assets/audio/your-file.mp3'` on a track.
   The player, waveforms and analyzers will switch to the file automatically.
   ========================================================================== */
window.BRND = window.BRND || {};

BRND.config = {
  brand: 'Bronderbility Music',
  email: 'hello@bronderbility.com',          // replace with the real inbox
  coords: '52.5200° N 13.4050° E',
  currency: '$',
  socials: [
    { id: 'SC', label: 'SoundCloud', url: 'https://soundcloud.com/' },
    { id: 'IG', label: 'Instagram',  url: 'https://instagram.com/' },
    { id: 'YT', label: 'YouTube',    url: 'https://youtube.com/' },
    { id: 'BC', label: 'Bandcamp',   url: 'https://bandcamp.com/' }
  ]
};

/* License tiers. `price: null` means “on request” (goes to the contact form). */
BRND.licenses = [
  {
    id: 'basic', name: 'Basic lease', format: 'MP3 320 kbps', price: 29,
    features: ['Untagged MP3 file', '5 000 streams', '1 music video', 'Non-profit live shows', 'Credit: prod. Bronderbility']
  },
  {
    id: 'premium', name: 'Premium lease', format: 'WAV 24-bit + MP3', price: 59, featured: true,
    features: ['Untagged WAV + MP3', '50 000 streams', '2 music videos', 'Paid live shows', 'Credit: prod. Bronderbility']
  },
  {
    id: 'trackout', name: 'Trackout', format: 'Stems + WAV + MP3', price: 119,
    features: ['All stems, 24-bit', '250 000 streams', 'Unlimited videos', 'Radio broadcast', 'Credit: prod. Bronderbility']
  },
  {
    id: 'exclusive', name: 'Exclusive', format: 'Full rights', price: null, priceLabel: 'from $499',
    features: ['Unlimited everything', 'Stems + project notes', 'Beat removed from store', 'Contract + publishing split']
  }
];

/* The four sound directions of the label. */
BRND.genres = [
  { id: 'trap',       code: 'TRP', title: 'Trap',       sub: 'Modern hip hop',      desc: 'Distorted 808 / hard hats / cold electronics', bpm: '130—150' },
  { id: 'boombap',    code: 'BBP', title: 'Boom bap',   sub: 'Lo-fi hip hop',       desc: 'Vintage / grit / vinyl dust',                  bpm: '84—92'   },
  { id: 'industrial', code: 'IND', title: 'Industrial', sub: 'EBM / synthwave',     desc: 'Dark electronics / analog synths',             bpm: '96—128'  },
  { id: 'nudisco',    code: 'NDG', title: 'Nu-disco',   sub: 'G-funk',              desc: 'Melodic / vintage synths / portamento leads',  bpm: '94—116'  }
];

/* Beats.
   genre   → which generator in audio.js plays it
   style   → sub-flavour of the generator (see audio.js)
   key     → root note, scale → minor | harmonic | phrygian | dorian
   seed    → picks patterns & melodies, so every beat is different but stable
   cover   → generative artwork style (see art.js) */
BRND.tracks = [
  { id: 'machine-heart',     title: 'Machine Heart',         genre: 'industrial', style: 'ebm',       tags: ['EBM', 'Industrial'],     bpm: 126, key: 'F',  scale: 'phrygian', duration: 208, price: 29, seed: 11, cover: 'refinery' },
  { id: '808-funeral',       title: '808 Funeral',           genre: 'trap',       style: 'hard',      tags: ['Trap', 'Distorted 808'], bpm: 145, key: 'C#', scale: 'harmonic', duration: 174, price: 29, seed: 23, cover: 'spire' },
  { id: 'cold-signals',      title: 'Cold Signals',          genre: 'industrial', style: 'synthwave', tags: ['Industrial', 'Dark'],    bpm: 118, key: 'D',  scale: 'minor',    duration: 252, price: 29, seed: 37, cover: 'pylon' },
  { id: 'dusted-tape',       title: 'Dusted Tape',           genre: 'boombap',    style: 'lofi',      tags: ['Lo-fi', 'Boom bap'],     bpm: 86,  key: 'A',  scale: 'minor',    duration: 158, price: 29, seed: 41, cover: 'vinyl' },
  { id: 'broken-system',     title: 'Broken System',         genre: 'industrial', style: 'techno',    tags: ['EBM', 'Techno'],         bpm: 128, key: 'G',  scale: 'phrygian', duration: 236, price: 29, seed: 53, cover: 'city' },
  { id: 'chrome-sunset',     title: 'Chrome Sunset',         genre: 'nudisco',    style: 'disco',     tags: ['Nu-disco', 'Synth'],     bpm: 116, key: 'E',  scale: 'dorian',   duration: 220, price: 29, seed: 67, cover: 'grid' },
  { id: 'concrete-ice',      title: 'Concrete Ice',          genre: 'trap',       style: 'dark',      tags: ['Trap', 'Dark'],          bpm: 138, key: 'G#', scale: 'minor',    duration: 192, price: 29, seed: 71, cover: 'city' },
  { id: 'empty-streets',     title: 'Empty Streets',         genre: 'industrial', style: 'ambient',   tags: ['Industrial', 'Ambient'], bpm: 96,  key: 'B',  scale: 'minor',    duration: 321, price: 29, seed: 83, cover: 'tvtower' },
  { id: 'lowrider-transmission', title: 'Lowrider Transmission', genre: 'nudisco', style: 'gfunk', tags: ['G-funk', 'West coast'],    bpm: 94,  key: 'F',  scale: 'dorian',   duration: 202, price: 29, seed: 97, cover: 'palms' },
  { id: 'no-signal',         title: 'No Signal',             genre: 'trap',       style: 'electro',   tags: ['Trap', 'Electronic'],    bpm: 150, key: 'A#', scale: 'harmonic', duration: 167, price: 29, seed: 101, cover: 'pylon' },
  { id: 'basement-94',       title: 'Basement 94',           genre: 'boombap',    style: 'dusty',     tags: ['Boom bap', 'Vinyl'],     bpm: 90,  key: 'D',  scale: 'dorian',   duration: 185, price: 29, seed: 113, cover: 'vinyl' },
  { id: 'night-drive-protocol', title: 'Night Drive Protocol', genre: 'industrial', style: 'synthwave', tags: ['Synthwave', 'Dark'],  bpm: 106, key: 'C',  scale: 'minor',    duration: 214, price: 29, seed: 127, cover: 'grid' },
  { id: 'rituals-of-silence', title: 'Rituals of Silence',   genre: 'trap',       style: 'dark',      tags: ['Trap', 'Industrial'],    bpm: 140, key: 'F',  scale: 'harmonic', duration: 228, price: 29, seed: 7,  cover: 'spire', featured: true }
];

/* Sound kits (samples & loops). Sold as a single file, no license tiers. */
BRND.kits = [
  { id: 'kit-distortion', title: 'Distortion Kit Vol. 1', contents: '120 one-shots: 808s, kicks, industrial FX', format: 'WAV 24-bit', price: 24, seed: 211, cover: 'refinery' },
  { id: 'kit-dust',       title: 'Dust & Vinyl',          contents: '90 drums, foley and crackle layers',       format: 'WAV 24-bit', price: 19, seed: 223, cover: 'vinyl' },
  { id: 'kit-chrome',     title: 'Chrome Melodies',       contents: '40 loops: nu-disco & G-funk synths',        format: 'WAV + MIDI', price: 29, seed: 227, cover: 'palms' }
];
