/** Озвучка через Web Speech API (голос браузера/OS). */
export function speakEnglish(text: string): void {
  const t = text.trim()
  if (!t || typeof window === 'undefined') return
  const synth = window.speechSynthesis
  if (!synth) return
  synth.cancel()
  const u = new SpeechSynthesisUtterance(t)
  u.lang = 'en-US'
  const voices = synth.getVoices()
  const en =
    voices.find((v) => v.lang?.toLowerCase().startsWith('en-us')) ??
    voices.find((v) => v.lang?.toLowerCase().startsWith('en'))
  if (en) u.voice = en
  synth.speak(u)
}

export function speechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && Boolean(window.speechSynthesis)
}
