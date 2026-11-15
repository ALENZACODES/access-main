import { t, type Lang } from "../i18n/catalog.ts";
import { ACTION_IDS, type ActionId, type AdapterResult, type ControlAdapter } from "../types.ts";

/**
 * A transcript is text that something else produced (a person typing, or a platform
 * dictation feature). This adapter does no speech recognition and opens no microphone.
 */
export interface VoiceInput {
  transcript: string;
}

export function normaliseTranscript(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface VoiceCommand {
  action: ActionId;
  words: string[];
}

export class VoiceAdapter implements ControlAdapter<VoiceInput> {
  readonly mode = "voice" as const;
  private readonly table = new Map<string, ActionId>();
  private readonly helpWords: string[];
  private readonly list: VoiceCommand[];

  constructor(private readonly lang: Lang) {
    this.list = ACTION_IDS.map((action) => ({ action, words: t(lang, `voice.words.${action}`).split("|") }));
    this.helpWords = t(lang, "voice.words.help").split("|");
    for (const command of this.list) {
      for (const word of command.words) this.table.set(normaliseTranscript(word), command.action);
    }
  }

  /** The documented command list for this language. */
  commands(): VoiceCommand[] {
    return this.list.map((command) => ({ action: command.action, words: [...command.words] }));
  }

  help(): string[] {
    return [...this.helpWords];
  }

  /** Whole-phrase match only. Anything else is reported as not understood. */
  handle(input: VoiceInput): AdapterResult {
    const heard = input.transcript.trim();
    const phrase = normaliseTranscript(heard);
    if (this.helpWords.some((word) => normaliseTranscript(word) === phrase)) return { kind: "help" };
    const action = this.table.get(phrase);
    if (action) return { kind: "action", action };
    return { kind: "unknown", heard };
  }

  plan(action: ActionId): VoiceInput[] {
    const command = this.list.find((entry) => entry.action === action);
    return [{ transcript: command?.words[0] ?? "" }];
  }

  reset(): void {}
}
