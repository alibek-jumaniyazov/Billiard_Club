/** Capture the install event before a user navigates to /download. */
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
let prompt: InstallPrompt | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
export const installed = (): boolean => window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
export const canInstall = (): boolean => prompt !== null;
export const onInstallChange = (fn: () => void): (() => void) => { listeners.add(fn); return () => listeners.delete(fn); };
export const installApp = async (): Promise<void> => {
  const event = prompt;
  if (!event) return;
  prompt = null;
  emit();
  await event.prompt();
  await event.userChoice;
  emit();
};
window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); prompt = event as InstallPrompt; emit(); });
window.addEventListener('appinstalled', () => { prompt = null; emit(); });

export const mobilePlatform = (ua: string, touchPoints = 0): 'ios' | 'android' | null => {
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && touchPoints > 1)) return 'ios';
  return /Android/i.test(ua) ? 'android' : null;
};
