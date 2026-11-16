/**
 * A best-effort guess at a text's language, used only for presentation: the
 * `lang` attribute on displayed assignment text and the read-aloud voice. It is
 * not used in any measurement. The app's own language is Korean, so anything
 * without clear Latin-script dominance is treated as Korean.
 */
export function documentLanguageFor(text: string): "ko" | "en" {
  let hangul = 0;
  let latin = 0;
  for (const char of text) {
    if (/\p{Script=Hangul}/u.test(char)) hangul++;
    else if (/[A-Za-z]/.test(char)) latin++;
  }
  return latin > 0 && hangul * 4 < latin ? "en" : "ko";
}

/** BCP 47 tag for SpeechSynthesisUtterance.lang. */
export function speechLanguageFor(text: string): "ko-KR" | "en-US" {
  return documentLanguageFor(text) === "en" ? "en-US" : "ko-KR";
}
