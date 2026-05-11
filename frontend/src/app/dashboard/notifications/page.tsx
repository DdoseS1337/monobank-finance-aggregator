import { redirect } from 'next/navigation';
import { Bell } from 'lucide-react';
import { getServerToken, notificationsApi } from '@/lib/api';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { NotificationItem } from './notification-item';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const token = await getServerToken();
  if (!token) redirect('/login');
  const items = await notificationsApi.inbox(token, { limit: 100 }).catch(() => []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Сповіщення"
        description="In-app inbox з усіма системними подіями. Email/push/Telegram налаштовуються в /settings."
      />
      {items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="Inbox порожній"
          description="Як тільки виникне щось важливе — тригер бюджету, прогноз дефіциту, нова рекомендація — побачите тут."
        />
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li key={n.id}>
              <NotificationItem notification={n} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
