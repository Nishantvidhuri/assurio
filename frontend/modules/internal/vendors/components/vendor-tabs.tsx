'use client';

import { useRouter } from 'next/navigation';
import { TabBar, TabBarItem } from '@/shared/components/ui';

interface VendorTabsProps {
  active: 'overview' | 'logs';
}

/** Overview ⇄ API Call logs switcher. Each tab is its own route so the logs
 *  tab keeps its filter/pagination state in the URL independently. */
export function VendorTabs({ active }: VendorTabsProps) {
  const router = useRouter();

  return (
    <TabBar
      defaultValue="overview"
      value={active}
      onValueChange={(value) =>
        router.push(
          value === 'logs'
            ? '/admin/vendors/logs'
            : '/admin/vendors',
        )
      }
    >
      <TabBarItem value="overview">Overview</TabBarItem>
      <TabBarItem value="logs">API Call logs</TabBarItem>
    </TabBar>
  );
}
