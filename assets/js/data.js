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
  email: 'info@bronderbility.com',          // replace with the real inbox
  coords: '47.466305° N 10.961714° E', 

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
   genre   → ONLY one of: 'trap' | 'boombap' | 'industrial' | 'nudisco'
             (filters and genre cards use it; dark electronic → 'industrial')
   style   → sub-flavour of the generator (see audio.js)
   key     → root note: 'A', 'F#', 'Am' and 'Fm' all work
   scale   → minor | harmonic | phrygian | dorian
   src     → your mp3 in assets/audio/ (name must match letter for letter)
   seed    → picks patterns & melodies, so every beat is different but stable
   cover   → generative artwork style (see art.js) */
BRND.tracks = [
  { id: 'no-way-out',     title: 'No Way Out',         genre: 'industrial', style: 'dark',       tags: ['Dark', 'Electronic'],     bpm: 150, key: 'Am',  scale: 'minor', duration: 167, price: 29, seed: 11, cover: 'refinery', src: 'assets/audio/no-way-out-watermarked.mp3' },
  { id: 'pain-of-my-life',       title: 'Pain of my life',           genre: 'trap',       style: 'lyrics',      tags: ['Trap', 'lyrics'], bpm: 90, key: 'Dm', scale: 'minor', duration: 218, price: 29, seed: 23, cover: 'spire', src: 'assets/audio/pain-of-my-life-watermarked.mp3' },
  { id: 'revolt-on-the-ship',      title: 'Revolt on the ship',          genre: 'industrial', style: 'Boom bap', tags: ['Electronic', 'Boom bap'],    bpm: 156, key: 'Gm',  scale: 'minor',    duration: 170, price: 29, seed: 37, cover: 'pylon', src: 'assets/audio/revolt-on-the-ship-watermarked.mp3' },
  { id: 'spice-dimond',       title: 'Spice Dimond',           genre: 'boombap',    style: 'lofi',      tags: ['Lo-fi', 'Boom bap'],     bpm:140,  key: 'Fm',  scale: 'minor',    duration: 108, price: 29, seed: 41, cover: 'vinyl', src: 'assets/audio/Spice-Dimond-watermarked.mp3' }
];

/* Sound kits (samples & loops). Sold as a single file, no license tiers. */
BRND.kits = [
  { id: 'kit-distortion', title: 'Distortion Kit Vol. 1', contents: '120 one-shots: 808s, kicks, industrial FX', format: 'WAV 24-bit', price: 24, seed: 211, cover: 'refinery' },
  { id: 'kit-dust',       title: 'Dust & Vinyl',          contents: '90 drums, foley and crackle layers',       format: 'WAV 24-bit', price: 19, seed: 223, cover: 'vinyl' },
  { id: 'kit-chrome',     title: 'Chrome Melodies',       contents: '40 loops: nu-disco & G-funk synths',        format: 'WAV + MIDI', price: 29, seed: 227, cover: 'palms' }
];
