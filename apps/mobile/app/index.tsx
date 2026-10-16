import { Redirect } from 'expo-router';
import { useSession } from '../src/state/session';

export default function Index() {
  const { member } = useSession();
  return <Redirect href={member ? '/home' : '/login'} />;
}
