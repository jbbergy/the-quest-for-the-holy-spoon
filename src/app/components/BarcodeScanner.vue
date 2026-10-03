<script setup lang="ts">
/**
 * Scanner un code-barres avec la caméra.
 *
 * Une fenêtre modale (`<dialog>` natif, comme `ConfirmDialog`) montre l'image
 * de la caméra arrière ; dès qu'un code est lu, elle se ferme et le rend par
 * `detected`. La recherche fait le reste : un code-barres tapé ou scanné, c'est
 * la même recherche.
 *
 * La caméra est coupée à chaque fermeture — code lu, « Annuler », Échap —
 * sans quoi le voyant resterait allumé et la batterie filerait.
 */
import { onBeforeUnmount, ref, useId } from 'vue'

import {
  barcodeReader,
  type BarcodeReader,
  ReadingConfirmation,
} from '@/app/barcode/barcodeDetector'
import { beep, prepareBeep } from '@/app/barcode/beep'
import { t } from '@/i18n'

const emit = defineEmits<{ detected: [code: string] }>()

/** Entre deux lectures : assez pour suivre le geste, sans chauffer le téléphone. */
const SCAN_INTERVAL_MS = 150
/**
 * Une image sans code-barres ne lève pas d'erreur, elle rend une liste vide.
 * Des erreurs à la suite disent que le lecteur lui-même est en panne : mieux
 * vaut le dire que filmer pour rien.
 */
const MAX_FAILURES = 5
/**
 * La part de l'image lue : le centre, où l'on vise. Plus large que le cadre
 * affiché, qui ne montre qu'une partie de l'image (`object-fit: cover`) : un
 * code bien cadré y est toujours entier, et ce qui traîne autour — un autre
 * code-barres, un texte — n'est pas lu.
 */
const CROP = { width: 0.8, height: 0.5 } as const

type Status = 'starting' | 'scanning' | 'denied' | 'no-camera' | 'failed'

const dialog = ref<HTMLDialogElement | null>(null)
const video = ref<HTMLVideoElement | null>(null)
const status = ref<Status>('starting')
const titleId = useId()
const statusId = useId()

let stream: MediaStream | null = null
let timer: ReturnType<typeof setTimeout> | undefined
/** Change à chaque ouverture : une lecture lancée avant la fermeture ne compte plus. */
let session = 0

const MESSAGE: Readonly<Record<Status, string>> = {
  starting: 'meal.scanner.starting',
  scanning: 'meal.scanner.aim',
  denied: 'meal.scanner.denied',
  'no-camera': 'meal.scanner.noCamera',
  failed: 'meal.scanner.failed',
}

function stop(): void {
  session += 1
  clearTimeout(timer)
  stream?.getTracks().forEach((track) => track.stop())
  stream = null
  if (video.value) video.value.srcObject = null
}

async function open(): Promise<void> {
  stop()
  const current = session
  status.value = 'starting'
  dialog.value?.showModal()
  // Avant toute attente : le son n'est permis que pendant le toucher du bouton.
  prepareBeep()

  try {
    const [media, reader] = await Promise.all([
      // Une image plus fine sépare mieux les barres fines ; sans cette demande,
      // bien des téléphones s'en tiennent à 640 × 480.
      navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      }),
      barcodeReader(),
    ])
    if (current !== session) {
      media.getTracks().forEach((track) => track.stop())
      return
    }
    stream = media
    void focusContinuously(media)
    if (video.value === null) return
    video.value.srcObject = media
    await video.value.play()
    status.value = 'scanning'
    scan(reader, current, 0)
  } catch (cause) {
    if (current !== session) return
    stop()
    const name = cause instanceof DOMException ? cause.name : ''
    status.value =
      name === 'NotAllowedError' || name === 'SecurityError'
        ? 'denied'
        : name === 'NotFoundError' || name === 'OverconstrainedError'
          ? 'no-camera'
          : 'failed'
  }
}

/**
 * Mise au point continue, là où le téléphone l'accepte (Chrome sur Android) :
 * sans elle, certains restent réglés à l'infini et le code reste flou de près.
 * Ailleurs, la demande est ignorée.
 */
async function focusContinuously(media: MediaStream): Promise<void> {
  const [track] = media.getVideoTracks()
  const capabilities = (track?.getCapabilities?.() ?? {}) as { focusMode?: string[] }
  if (track === undefined || !capabilities.focusMode?.includes('continuous')) return
  try {
    await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] })
  } catch {
    // La mise au point automatique du téléphone fera l'affaire.
  }
}

const canvas = document.createElement('canvas')

/** Le centre de l'image courante, là où l'on vise. */
function centre(frame: HTMLVideoElement): HTMLCanvasElement | null {
  const width = Math.round(frame.videoWidth * CROP.width)
  const height = Math.round(frame.videoHeight * CROP.height)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (width === 0 || height === 0 || context === null) return null
  canvas.width = width
  canvas.height = height
  context.drawImage(
    frame,
    (frame.videoWidth - width) / 2,
    (frame.videoHeight - height) / 2,
    width,
    height,
    0,
    0,
    width,
    height,
  )
  return canvas
}

function scan(
  reader: BarcodeReader,
  current: number,
  failures: number,
  confirmation = new ReadingConfirmation(),
): void {
  timer = setTimeout(async () => {
    const frame = video.value
    if (current !== session || frame === null) return
    try {
      const image = frame.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA ? centre(frame) : null
      const found = image === null ? [] : await reader.detect(image)
      if (current !== session) return
      const code = confirmation.see(found.map((barcode) => barcode.rawValue))
      if (code !== null) {
        // Un bip et une courte vibration : le code est lu, on peut baisser le
        // téléphone. La vibration est ignorée là où elle n'existe pas (Firefox
        // pour Android, iPhone, ordinateur) ; le bip prend le relais.
        beep()
        navigator.vibrate?.(80)
        close()
        emit('detected', code)
        return
      }
      scan(reader, current, 0, confirmation)
    } catch {
      if (current !== session) return
      if (failures + 1 < MAX_FAILURES) {
        scan(reader, current, failures + 1, confirmation)
        return
      }
      stop()
      status.value = 'failed'
    }
  }, SCAN_INTERVAL_MS)
}

function close(): void {
  stop()
  if (dialog.value?.open) dialog.value.close()
}

onBeforeUnmount(stop)

defineExpose({ open })
</script>

<template>
  <dialog
    ref="dialog"
    class="scanner"
    :aria-labelledby="titleId"
    :aria-describedby="statusId"
    @close="stop"
  >
    <h2
      :id="titleId"
      class="scanner__title"
    >
      {{ t('meal.scanner.title') }}
    </h2>

    <div
      class="scanner__view"
      :class="{ 'scanner__view--live': status === 'scanning' }"
    >
      <video
        ref="video"
        class="scanner__video"
        muted
        playsinline
        aria-hidden="true"
      />
      <span
        class="scanner__frame"
        aria-hidden="true"
      />
    </div>

    <p
      :id="statusId"
      class="scanner__status"
      :class="{ 'scanner__status--error': status !== 'starting' && status !== 'scanning' }"
      role="status"
    >
      {{ t(MESSAGE[status]) }}
    </p>

    <div class="scanner__actions">
      <button
        v-if="status === 'failed' || status === 'no-camera'"
        type="button"
        class="scanner__button scanner__button--retry"
        @click="open"
      >
        {{ t('meal.scanner.retry') }}
      </button>
      <button
        type="button"
        class="scanner__button"
        @click="close"
      >
        {{ t('ui.cancel') }}
      </button>
    </div>
  </dialog>
</template>

<style scoped lang="scss">
.scanner {
  width: min(26rem, calc(100vw - 2rem));
  max-height: calc(100dvh - 2rem);
  padding: var(--space-4);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-lg);
  background: var(--color-surface-raised);
  box-shadow: var(--shadow-md);
  color: var(--color-text);
}

.scanner::backdrop {
  background: rgb(31 38 32 / 60%);
}

.scanner__title {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-lg);
}

/* Un cadre au format d'un code-barres : on sait où viser. */
.scanner__view {
  position: relative;
  overflow: hidden;
  aspect-ratio: 4 / 3;
  border-radius: var(--radius-md);
  background: #111;
}

.scanner__video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.scanner__frame {
  position: absolute;
  inset: 30% 10%;
  border: 3px solid #fff;
  border-radius: var(--radius-sm);
  box-shadow: 0 0 0 100vmax rgb(0 0 0 / 35%);
  opacity: 0;
}

.scanner__view--live .scanner__frame {
  opacity: 1;
}

.scanner__status {
  margin: var(--space-3) 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.scanner__status--error {
  color: var(--color-danger);
  font-weight: 700;
}

.scanner__actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.scanner__button {
  min-height: 3.25rem;
  padding: var(--space-2) var(--space-5);
  border: 2px solid var(--color-border-strong);
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.scanner__button--retry {
  border-color: transparent;
  background: var(--color-accent);
  color: var(--color-accent-contrast);
}

@media (forced-colors: active) {
  .scanner__button,
  .scanner__frame {
    border-color: ButtonText;
  }
}
</style>
