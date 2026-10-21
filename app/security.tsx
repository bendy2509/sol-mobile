import { Redirect } from 'expo-router';

/** Security and backup now lives in the Réglages tab. Kept as a redirect for old links. */
export default function SecurityRedirect() {
  return <Redirect href="/(tabs)/settings" />;
}
