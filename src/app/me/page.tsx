import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function Me() {
  const viewer = await getViewer();
  redirect(viewer ? `/users/${viewer.id}` : '/auth/login?next=/me');
}
