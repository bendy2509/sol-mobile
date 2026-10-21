import { Redirect } from 'expo-router';

/** The profile now lives in the Réglages tab. Kept as a redirect for old links. */
export default function ProfileRedirect() {
  return <Redirect href="/(tabs)/settings" />;
}
