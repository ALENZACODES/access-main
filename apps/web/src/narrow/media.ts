import { t, type CheckResult, type Entry } from './types.js';
import type { MediaFact } from './semantics.js';

/**
 * Audio and video on the page (WCAG 1.4.2 and 2.2.2). Sound that starts by
 * itself and runs more than three seconds is a measured failure. Whether a
 * video has speech that needs captions cannot be measured, so it is UNKNOWN.
 */

export type MediaRule = 'autoplay-sound' | 'autoplay-no-controls' | 'loop-no-pause' | 'no-captions' | 'embed';

export const MEDIA_RULES: readonly MediaRule[] = ['autoplay-sound', 'autoplay-no-controls', 'loop-no-pause', 'no-captions', 'embed'];

/** Seconds of automatic sound allowed by WCAG 1.4.2. */
export const SOUND_LIMIT_SECONDS = 3;

export function auditMedia(media: readonly MediaFact[]): CheckResult {
  const entries: Entry[] = [];
  const add = (m: MediaFact, status: 'fail' | 'unknown', rule: MediaRule, en: string, fr: string): void => {
    entries.push({ check: 'media', id: m.id, status, rule, message: t(en, fr) });
  };
  for (const m of media) {
    if (m.tag === 'embed') {
      add(m, 'unknown', 'embed', `The embedded player from ${m.host} cannot be inspected. Check that it has captions and that it does not start with sound.`, `Le lecteur intégré de ${m.host} ne peut pas être inspecté. Contrôlez qu’il a des sous-titres et ne démarre pas avec du son.`);
      continue;
    }
    // A page that only says autoplay is not playing yet if the browser refused it.
    const started = m.playing === true || (m.playing === null && m.autoplay);
    const longSound = m.duration === null || m.duration > SOUND_LIMIT_SECONDS || m.loop;
    if (started && !m.muted && longSound) {
      if (m.controls) {
        add(m, 'fail', 'autoplay-sound', 'Media plays with sound by itself for more than three seconds. A control is there but the sound should not start on its own.', 'Un média joue seul avec du son plus de trois secondes. Un contrôle existe mais le son ne devrait pas démarrer seul.');
      } else {
        add(m, 'fail', 'autoplay-no-controls', 'Media plays with sound by itself for more than three seconds and has no controls to stop it.', 'Un média joue seul avec du son plus de trois secondes et n’a aucun contrôle pour l’arrêter.');
      }
    }
    if (m.tag === 'video' && started && m.muted && !m.controls && (m.loop || m.duration === null || m.duration > 5)) {
      add(m, 'unknown', 'loop-no-pause', 'A moving video plays by itself with no controls. Check that there is another way to pause it.', 'Une vidéo animée joue seule sans contrôle. Contrôlez qu’il existe un autre moyen de la mettre en pause.');
    }
    if (m.tag === 'video' && !m.muted && !m.hasCaptions) {
      add(m, 'unknown', 'no-captions', 'This video has no captions or subtitles track. Check whether it has speech that needs them.', 'Cette vidéo n’a pas de piste de sous-titres. Contrôlez si elle contient de la parole qui en demande.');
    }
  }
  return { checked: media.length, entries };
}
