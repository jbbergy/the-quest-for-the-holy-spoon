/**
 * Le « bip » de caisse qui dit qu'un code-barres est lu.
 *
 * La vibration ne suffit pas : Firefox pour Android l'a désactivée pour tous
 * les sites, et Safari ne l'a jamais eue. Le son, lui, marche partout.
 *
 * Les navigateurs ne laissent une page émettre un son qu'après un geste de la
 * personne : `prepareBeep` s'appelle donc au toucher du bouton « Scanner »,
 * et `beep` plus tard, à la lecture du code.
 */

let audio: AudioContext | null = null

/** À appeler pendant le geste qui ouvre le scanner. */
export function prepareBeep(): void {
  try {
    audio ??= new AudioContext()
    if (audio.state === 'suspended') void audio.resume()
  } catch {
    audio = null
  }
}

/** Un bip court et clair, au volume des médias ; rien si le son n'est pas disponible. */
export function beep(): void {
  if (audio === null || audio.state !== 'running') return
  const start = audio.currentTime
  const tone = audio.createOscillator()
  const volume = audio.createGain()
  tone.type = 'sine'
  tone.frequency.value = 1760
  // Attaque et extinction de quelques millisecondes : un son coupé net claque.
  volume.gain.setValueAtTime(0, start)
  volume.gain.linearRampToValueAtTime(0.2, start + 0.01)
  volume.gain.setValueAtTime(0.2, start + 0.1)
  volume.gain.linearRampToValueAtTime(0, start + 0.12)
  tone.connect(volume).connect(audio.destination)
  tone.start(start)
  tone.stop(start + 0.13)
}
