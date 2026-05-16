/** SessionStorage keys so personalization auto-prompt runs once per login, skip persists until logout. */

export function personalizeSkipKey(userId: string) {
  return `lh_personalize_skip_${userId}`;
}

export function personalizeGateKey(userId: string) {
  return `lh_personalize_gate_${userId}`;
}

export function setPersonalizationSkippedThisSession(userId: string) {
  sessionStorage.setItem(personalizeSkipKey(userId), "1");
}

export function clearPersonalizationGate(userId: string) {
  sessionStorage.removeItem(personalizeGateKey(userId));
}

export function clearPersonalizationSessionKeys(userId: string) {
  sessionStorage.removeItem(personalizeSkipKey(userId));
  sessionStorage.removeItem(personalizeGateKey(userId));
}
