import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { useFocusEffect } from 'expo-router';
import { useCallback, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { on, type UiEventName } from '../lib/events';
import { storage } from '../lib/storage';
import { SoundManager, type AudioSettings, type SfxName } from './manager';

/* eslint-disable @typescript-eslint/no-require-imports -- static asset requires for Metro */
const SOURCES: Record<SfxName | 'bgm', number> = {
  tap: require('../../assets/sfx/tap.wav'),
  correct: require('../../assets/sfx/correct.wav'),
  wrong: require('../../assets/sfx/wrong.wav'),
  hint: require('../../assets/sfx/hint.wav'),
  tick: require('../../assets/sfx/tick.wav'),
  questionStart: require('../../assets/sfx/questionStart.wav'),
  reveal: require('../../assets/sfx/reveal.wav'),
  victory: require('../../assets/sfx/victory.wav'),
  defeat: require('../../assets/sfx/defeat.wav'),
  levelUp: require('../../assets/sfx/levelUp.wav'),
  chestOpen: require('../../assets/sfx/chestOpen.wav'),
  purchase: require('../../assets/sfx/purchase.wav'),
  error: require('../../assets/sfx/error.wav'),
  bgm: require('../../assets/bgm/lobby.wav'),
};
/* eslint-enable @typescript-eslint/no-require-imports */

const SETTINGS_KEY = 'zuirock.audio';
const isWeb = Platform.OS === 'web';

export const sound = new SoundManager({
  create: (name) => createAudioPlayer(SOURCES[name]),
  save: (s) => void storage.set(SETTINGS_KEY, s),
  locked: isWeb,
});

const EVENT_SOUNDS: Record<UiEventName, SfxName> = {
  tap: 'tap',
  correct: 'correct',
  wrong: 'wrong',
  hintReveal: 'hint',
  tick: 'tick',
  questionStart: 'questionStart',
  reveal: 'reveal',
  victory: 'victory',
  defeat: 'defeat',
  levelUp: 'levelUp',
  chestOpen: 'chestOpen',
};

let started = false;
/** Idempotent: restore settings, subscribe to the UI event bus, preload, arm the web unlock. */
export function startAudio(): void {
  if (started) return;
  started = true;
  void storage.get<AudioSettings>(SETTINGS_KEY).then((s) => sound.restore(s));
  if (!isWeb) void setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => undefined);
  (Object.keys(EVENT_SOUNDS) as UiEventName[]).forEach((e) => on(e, () => sound.play(EVENT_SOUNDS[e])));
  sound.preload();
  if (isWeb && typeof document !== 'undefined') {
    const unlock = () => {
      sound.unlock();
      ['pointerdown', 'keydown', 'touchend'].forEach((t) => document.removeEventListener(t, unlock, true));
    };
    ['pointerdown', 'keydown', 'touchend'].forEach((t) => document.addEventListener(t, unlock, true));
  }
}

export function useAudioSettings(): AudioSettings {
  return useSyncExternalStore(sound.subscribe, sound.getSettings, sound.getSettings);
}

/** Lobby BGM while the calling screen is focused (home, waiting room); battles never call this. */
export function useLobbyBgm(): void {
  useFocusEffect(useCallback(() => sound.holdBgm(), []));
}
