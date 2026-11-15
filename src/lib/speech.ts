export type VoiceGender = 'female' | 'male';

export const VOICE_GENDER_STORAGE_KEY = 'ankor-voice-gender';
export const DEFAULT_VOICE_GENDER: VoiceGender = 'female';

export interface SpeechOptions {
  language?: string;
  rate?: number;
  gender?: VoiceGender;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
}

export const DEFAULT_LANGUAGE = 'ko-KR';
const VOICE_WAIT_MS = 1500;

let activeRequest = 0;
let cancelVoiceWait: (() => void) | undefined;
let activeAudio: HTMLAudioElement | undefined;

// The Web Speech API exposes no gender field, so we infer it from the voice
// name. Female is checked first because "female" contains "male", and several
// common female names (e.g. "Samantha") contain male-ish substrings.
const FEMALE_VOICE_HINTS = [
  'female', 'woman', 'girl', 'heami', 'sunhi', 'seoyeon', 'yuna', 'sora', '한국의',
  'hyeri', 'jimin', 'sooji', 'minji', 'zira', 'samantha', 'victoria',
  'karen', 'moira', 'tessa', 'fiona', 'susan', 'aria', 'jenny', 'sonia',
  'natasha', 'ayumi', 'kyoko', 'meijia', 'ting', 'paulina', 'monica',
  'lucia', 'helena', 'amelie', 'anna', 'emma', 'olivia', 'joanna',
  'kendra', 'kimberly', 'salli', 'ivy', 'haruka', 'sakura',
];
const MALE_VOICE_HINTS = [
  'male', 'man', 'boy', 'injoon', 'gookmin', 'seongjin', 'hyunwoo',
  'minjun', 'junho', 'david', 'mark', 'george', 'james', 'daniel',
  'ryan', 'guy', 'eric', 'brian', 'matthew', 'christopher', 'alex',
  'fred', 'diego', 'jorge', 'ivan', 'paolo', 'cyril', 'yuri', 'xander',
  'thomas', 'ian', 'liam', 'william', 'oliver',
];

function detectVoiceGender(voice: SpeechSynthesisVoice): VoiceGender | undefined {
  const name = voice.name.toLowerCase();
  if (FEMALE_VOICE_HINTS.some(hint => name.includes(hint))) return 'female';
  if (MALE_VOICE_HINTS.some(hint => name.includes(hint))) return 'male';
  return undefined;
}

/** Read the gender preference saved from Settings. */
export function readVoiceGender(): VoiceGender {
  if (typeof window === 'undefined') return DEFAULT_VOICE_GENDER;
  try {
    const raw = window.localStorage.getItem(VOICE_GENDER_STORAGE_KEY);
    if (!raw) return DEFAULT_VOICE_GENDER;
    // Settings persists via useLocalStorage (JSON-encoded, e.g. "\"male\"");
    // accept a raw value too for robustness.
    const value = raw.startsWith('"') ? JSON.parse(raw) : raw;
    return value === 'male' ? 'male' : 'female';
  } catch {
    return DEFAULT_VOICE_GENDER;
  }
}

export function findVoice(
  voices: SpeechSynthesisVoice[],
  language: string,
  gender: VoiceGender,
): SpeechSynthesisVoice | undefined {
  const normalized = language.toLowerCase();
  const base = normalized.split('-')[0];
  const langMatches = voices.filter(voice => {
    const lang = voice.lang.toLowerCase();
    return lang === normalized || lang.startsWith(`${base}-`);
  });
  if (langMatches.length > 0) {
    return langMatches.find(voice => detectVoiceGender(voice) === gender) ?? langMatches[0];
  }
  // No voice for this language. Still honour the chosen gender (e.g. on a bare
  // Windows with only English voices, "Male" picks David/Mark, not Zira).
  return voices.find(voice => detectVoiceGender(voice) === gender);
}

/** Strict: a voice that matches BOTH the language and the requested gender. */
export function findGenderVoice(
  voices: SpeechSynthesisVoice[],
  language: string,
  gender: VoiceGender,
): SpeechSynthesisVoice | undefined {
  const normalized = language.toLowerCase();
  const base = normalized.split('-')[0];
  return voices.find(voice => {
    const lang = voice.lang.toLowerCase();
    const matchesLang = lang === normalized || lang.startsWith(`${base}-`);
    return matchesLang && detectVoiceGender(voice) === gender;
  });
}

export function cancelSpeech() {
  activeRequest += 1;
  cancelVoiceWait?.();
  cancelVoiceWait = undefined;
  if (activeAudio) {
    try { activeAudio.pause(); } catch { /* ignore */ }
    activeAudio = undefined;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Fallback for devices with no installed voice for the language (common on
 * Android without the Korean TTS pack). Uses Google's public TTS audio, which
 * needs no CORS header because it plays through an <audio> element.
 */
function playRemoteTts(
  text: string,
  language: string,
  onStart?: () => void,
  onEnd?: () => void,
): Promise<boolean> {
  return new Promise((resolve) => {
    const lang = language.split('-')[0];
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${lang}&q=${encodeURIComponent(text)}`;
    const audio = new Audio(url);
    activeAudio = audio;
    let started = false;

    audio.onplaying = () => {
      started = true;
      onStart?.();
    };
    audio.onended = () => {
      if (activeAudio === audio) activeAudio = undefined;
      onEnd?.();
      resolve(true);
    };
    audio.onerror = () => {
      if (activeAudio === audio) activeAudio = undefined;
      resolve(false);
    };
    audio.play().catch(() => {
      if (activeAudio === audio) activeAudio = undefined;
      resolve(false);
    });

    window.setTimeout(() => {
      if (!started) {
        if (activeAudio === audio) activeAudio = undefined;
        resolve(false);
      }
    }, 8000);
  });
}

async function waitForVoice(
  language: string,
  gender: VoiceGender,
  request: number,
): Promise<SpeechSynthesisVoice | undefined> {
  const synthesis = window.speechSynthesis;
  const voices = synthesis.getVoices();
  const immediate = findVoice(voices, language, gender);
  if (immediate || voices.length > 0) return immediate;

  return new Promise(resolve => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      synthesis.removeEventListener('voiceschanged', finish);
      window.clearTimeout(timeout);
      if (cancelVoiceWait === finish) cancelVoiceWait = undefined;
      resolve(request === activeRequest ? findVoice(synthesis.getVoices(), language, gender) : undefined);
    };

    const timeout = window.setTimeout(finish, VOICE_WAIT_MS);
    cancelVoiceWait = finish;
    synthesis.addEventListener('voiceschanged', finish);
  });
}

/** Speak a term with the deck language, falling back to Korean for language-neutral decks. */
export async function speakText(text: string, options: SpeechOptions = {}): Promise<boolean> {
  const term = text.trim();
  if (!term) return false;
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    options.onError?.('Speech playback is not supported in this browser.');
    return false;
  }

  const synthesis = window.speechSynthesis;
  const language = options.language || DEFAULT_LANGUAGE;
  const gender = options.gender ?? DEFAULT_VOICE_GENDER;
  const request = ++activeRequest;
  cancelVoiceWait?.();
  cancelVoiceWait = undefined;
  // Cancel first so a previous card can never finish over the newly requested term.
  synthesis.cancel();

  const voice = await waitForVoice(language, gender, request);
  if (request !== activeRequest) return false;

  // Never read the term with a voice from another language: that is what makes
  // Korean words sound "wrong" on devices with no Korean TTS voice installed.
  const requestedBase = language.toLowerCase().split('-')[0];
  const voiceBase = voice ? voice.lang.toLowerCase().split('-')[0] : '';
  if (!voice || voiceBase !== requestedBase) {
    const played = await playRemoteTts(term, language, options.onStart, options.onEnd);
    if (played) return true;
    options.onError?.(
      `No ${language} voice found. Install a ${language} text-to-speech voice in your device settings.`,
    );
    return false;
  }

  const utterance = new SpeechSynthesisUtterance(term);
  utterance.lang = voice.lang || language;
  utterance.rate = options.rate ?? 0.9;
  utterance.voice = voice;

  utterance.onstart = () => {
    if (request === activeRequest) options.onStart?.();
  };
  utterance.onend = () => {
    if (request === activeRequest) options.onEnd?.();
  };
  utterance.onerror = event => {
    if (request !== activeRequest) return;
    options.onEnd?.();
    // Browsers report intentional cancellation as an error; it is not a playback failure.
    if (event.error !== 'canceled' && event.error !== 'interrupted') {
      options.onError?.('This word could not be played. Check your browser audio and speech voice settings.');
    }
  };

  try {
    synthesis.speak(utterance);
    return true;
  } catch {
    options.onEnd?.();
    options.onError?.('This word could not be played. Check your browser audio and speech voice settings.');
    return false;
  }
}
